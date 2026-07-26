import { spawn } from "child_process";
import { mkdirSync, readdirSync, rmSync, statSync } from "fs";
import path from "path";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { config, cookieArgs } from "../config";

// Extensions a *finished* download can land under, in the order we prefer them.
// Nothing outside this list may ever be handed to the transcription step: an
// unfinished file still uploads and still gets billed, it just transcribes a
// truncated recording.
const AUDIO_EXTENSIONS = [
  "mp3", "m4a", "mp4", "webm", "opus", "ogg", "oga",
  "wav", "flac", "aac", "mka", "mkv", "mov",
];

/**
 * True for yt-dlp's own scratch files for `id`: the in-progress download
 * `<id>.<ext>.part` plus its fragment-index sidecar `<id>.<ext>.ytdl`
 * (downloader/common.py), per-fragment files `<id>.<ext>.part-Frag12.part`
 * written under `-N`, and postprocessor temporaries, which prepend a marker
 * segment: `<id>.temp.<ext>`, `<id>.orig.<ext>` (postprocessor/ffmpeg.py).
 */
function isScratchFile(name: string, id: string): boolean {
  if (!name.startsWith(`${id}.`)) return false;
  return (
    /\.(part|ytdl|temp|aria2)$/.test(name) ||
    /^(temp|orig|uncut)\./.test(name.slice(id.length + 1))
  );
}

/**
 * Drop leftover scratch files from an earlier interrupted run. yt-dlp would
 * otherwise resume from the `.part`, and resume is only correct while the
 * `.part` and the `.ytdl` fragment index agree — a `.part` whose last fragment
 * write was cut short, or one whose `.ytdl` is gone, still resumes and still
 * exits 0, producing a silently truncated or duplicated recording. There is no
 * way to tell that apart from a resumable `.part` from the outside, so we trade
 * resume for correctness: a retry re-downloads from the first fragment.
 */
function clearScratchFiles(id: string): void {
  for (const name of readdirSync(config.audioDir)) {
    if (!name.startsWith(`${id}.`)) continue;
    const file = path.join(config.audioDir, name);
    // Empty files go too: a run killed during the mp3 conversion leaves the
    // 0-byte output ffmpeg had just opened, and yt-dlp then reports it as
    // "already downloaded" and fails postprocessing on *every* later run, so the
    // video stays unfetchable until it is removed.
    const size = statSync(file, { throwIfNoEntry: false })?.size;
    if (isScratchFile(name, id) || size === 0) rmSync(file, { force: true });
  }
}

/** Path of the finished audio for `id`, or null if there is none. */
function findAudio(id: string): string | null {
  for (const ext of AUDIO_EXTENSIONS) {
    // Exact `<id>.<ext>`, never a prefix match: an unrelated id can have this
    // one as a prefix, and `<id>.m4a.part` starts with the id too.
    const file = path.join(config.audioDir, `${id}.${ext}`);
    if (statSync(file, { throwIfNoEntry: false })?.size) return file;
  }
  return null;
}

/**
 * Duration ffprobe reports for `file`, in seconds, or null when it can't tell —
 * ffprobe missing from PATH, or a container it won't parse. Unknown is not a
 * failure: the check below only rejects a duration it actually measured.
 */
function probeDuration(file: string): Promise<number | null> {
  return new Promise((resolve) => {
    const proc = spawn(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration",
       "-of", "default=noprint_wrappers=1:nokey=1", "--", file],
      { timeout: 60_000, stdio: ["ignore", "pipe", "ignore"] }
    );
    let stdout = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.on("close", (code) => {
      const seconds = Number.parseFloat(stdout.trim());
      resolve(code === 0 && Number.isFinite(seconds) ? seconds : null);
    });
    proc.on("error", () => resolve(null));
  });
}

// How far the downloaded audio may differ from the duration the metadata stage
// recorded. Extraction rounds, so a couple of seconds is normal; the failures
// this guards against are not subtle (a cut-short resume loses most of the
// recording, a resume with no fragment index duplicates minutes of it).
function durationTolerance(expected: number): number {
  return Math.max(10, expected * 0.05);
}

/**
 * Reject audio whose length doesn't match what the metadata stage reported.
 * yt-dlp exits 0 for a truncated or duplicated resume, so file existence alone
 * says nothing — and every byte handed to the next stage is billed. The bad
 * file is deleted: it would otherwise be "already downloaded" on every retry,
 * and this same check would then fail forever.
 */
async function verifyDuration(file: string, expected: number | null): Promise<void> {
  if (!expected) return; // metadata had no duration to compare against
  const actual = await probeDuration(file);
  if (actual === null) return;

  const drift = Math.abs(actual - expected);
  if (drift <= durationTolerance(expected)) return;

  rmSync(file, { force: true });
  throw new Error(
    `Downloaded audio is ${actual.toFixed(1)}s but the source reports ${expected}s ` +
      `(off by ${drift.toFixed(1)}s) — discarded as incomplete`
  );
}

function runYtDlp(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    // stdout is discarded at the OS level rather than piped: yt-dlp writes a
    // progress line per fragment (>100KB for a long HLS track), and an unread
    // pipe fills after ~64KB, blocking the download until the timeout kills it.
    const proc = spawn("yt-dlp", args, {
      timeout: 600_000,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("close", (code, signal) => {
      // code === null means the process was killed (e.g. the 600s timeout);
      // treat that as a failure rather than a successful download.
      if (code === 0) resolve();
      else reject(new Error(`yt-dlp failed (code=${code} signal=${signal}): ${stderr.slice(-500)}`));
    });
    proc.on("error", reject);
  });
}

export async function downloadAudio(videoId: number): Promise<string> {
  const video = db
    .select()
    .from(schema.videos)
    .where(eq(schema.videos.id, videoId))
    .get();

  if (!video) throw new Error(`Video ${videoId} not found`);

  mkdirSync(config.audioDir, { recursive: true });
  clearScratchFiles(video.youtube_id);
  const outputTemplate = path.join(config.audioDir, `${video.youtube_id}.%(ext)s`);

  db.update(schema.videos)
    .set({ status: "downloading" })
    .where(eq(schema.videos.id, videoId))
    .run();

  const url =
    video.source_url || `https://www.youtube.com/watch?v=${video.youtube_id}`;

  await runYtDlp([
    "-x",
    "--audio-format", "mp3",
    "-o", outputTemplate,
    "--no-playlist",
    ...cookieArgs(video.platform),
    "--",
    url,
  ]);

  // Normally `<id>.mp3`, but yt-dlp may skip the conversion and leave the file
  // under the source extension instead.
  const audioPath = findAudio(video.youtube_id);
  if (audioPath) {
    await verifyDuration(audioPath, video.duration);
    return audioPath;
  }

  // Nothing complete under this id means yt-dlp reported success without
  // finishing the file. Fail loudly instead of passing a partial on to be
  // uploaded to the transcription API, which bills for it either way.
  const leftovers = readdirSync(config.audioDir).filter((f) =>
    f.startsWith(`${video.youtube_id}.`)
  );
  if (leftovers.length > 0) {
    throw new Error(
      `Audio download incomplete, only partial files: ${leftovers.join(", ")}`
    );
  }

  throw new Error("Audio file not found after download");
}
