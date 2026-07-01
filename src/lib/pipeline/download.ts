import { spawn } from "child_process";
import { mkdirSync, existsSync, readdirSync } from "fs";
import path from "path";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { config, cookieArgs } from "../config";

function runYtDlp(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", args, { timeout: 600_000 });
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

  // yt-dlp may produce the file with various extensions during conversion
  const mp3Path = path.join(config.audioDir, `${video.youtube_id}.mp3`);
  if (existsSync(mp3Path)) return mp3Path;

  // Fallback: find any file matching the source id
  const files = readdirSync(config.audioDir).filter((f) =>
    f.startsWith(video.youtube_id)
  );
  if (files.length > 0) return path.join(config.audioDir, files[0]);

  throw new Error("Audio file not found after download");
}
