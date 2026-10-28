import { spawn } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import type { Utterance } from "../types";
import type { Vocabulary } from "../vocabulary";

/**
 * Transcription through stt (~/development/stt), the one speech-to-text
 * command on this machine. stt owns the provider (Soniox by default,
 * AssemblyAI selectable), its API key and its limits, all in
 * ~/.config/stt/config; this module runs `stt transcribe --json` on the
 * downloaded audio and maps the result to the app's utterances.
 *
 * It touches no database and imports nothing through "@/", so `node --test`
 * loads it directly (test/stt.test.mjs).
 */

const MINUTE = 60_000;

// How long stt itself waits for the provider's job (`--timeout`). Long videos
// take minutes to transcribe; this only stops a job wedged in "processing".
const WAIT_SECONDS = 1800;

// The whole transcription, a retry included, must finish within this deadline.
// It sits under the orchestrator's 45min backstop for the stage, so stt is
// always stopped here, deleting its provider job, before the video is marked
// failed — never left running to write a transcript onto an errored video.
const DEADLINE_MS = 35 * MINUTE;

// SIGTERM makes stt delete the provider job on its way out (two DELETEs of
// at most 10s each); SIGKILL follows only if it is still running after that.
const KILL_GRACE_MS = 30_000;

// stt already retries a failed upload or submit twice; a transient exit after
// that gets one more run of the whole command, after this pause.
const RETRY_PAUSE_MS = 10_000;

// `stt check` reads the config only and never touches the network.
const CHECK_TIMEOUT_MS = 10_000;

// Exit status of `stt transcribe` for network trouble, a provider 5xx or a
// rate limit that outlasted stt's own retries (stt/exitcodes.py).
const EXIT_TRANSIENT = 5;

// stt's words for a transient failure it chose not to retry (stt.LeftBehind):
// a job creation whose answer was lost, or an upload it could not delete.
// Another run could leave one more thing at the provider that stt cannot
// delete, and bill a second job. stt clips its line at about 300 characters;
// "stt cannot see", which marks a lost answer, comes before "not retried".
const LEFT_BEHIND = /\bnot retried\b|\bstt cannot see\b/;

// How stt ends a line it clipped (stt/rest.py clip). A long provider error,
// such as an HTML error page, pushes an undeletable upload's "not retried"
// past the cut, and the line then reads exactly like a plain transient one.
const CLIPPED = /…$/;

// A transcript of the longest audio stt accepts is a few MB of JSON; more
// than this is not a transcript, so it is not kept in memory.
const MAX_STDOUT_CHARS = 64 * 1024 * 1024;
const STDERR_KEEP_CHARS = 8 * 1024;
const STDERR_TAIL_CHARS = 500;

export interface SttTranscript {
  provider: string;
  text: string;
  utterances: Utterance[];
}

export interface SttCheck {
  provider: string;
  ok: boolean;
  problem: string | null;
  maxSeconds: number | null;
}

/** Temp files carrying a vocabulary to stt; `dir` is removed afterwards. */
export interface VocabularyFiles {
  dir: string;
  termsFile: string | null;
  spellingsFile: string | null;
}

export interface SttOptions {
  /** The stt executable: TUBEREADER_STT_BIN, else `stt` from PATH. */
  bin?: string;
  deadlineMs?: number;
  killGraceMs?: number;
  retryPauseMs?: number;
}

export interface RunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  overflow: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** "5.0 h", "35 min" or "12 s", as stt words its own limits. */
export function readableDuration(seconds: number): string {
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)} h`;
  if (seconds >= 60) return `${Math.round(seconds / 60)} min`;
  return `${Math.round(seconds)} s`;
}

/**
 * Arguments for `stt transcribe`. Languages and key terms are always passed,
 * because without them stt falls back to its config, which is tuned for this
 * machine's own recordings: `--languages ""` leaves the language to
 * auto-detection, as AssemblyAI's language_detection did here before, and a
 * video without a vocabulary gets `--terms ""`, so personal key terms never
 * bias a YouTube video.
 */
export function transcribeArgs(audioPath: string, files: VocabularyFiles | null): string[] {
  const args = [
    "transcribe",
    // Absolute, so a source id that starts with "-" can never read as a flag.
    path.resolve(audioPath),
    "--json",
    "--timeout", String(WAIT_SECONDS),
    "--languages", "",
  ];
  if (files?.termsFile) args.push("--terms-file", files.termsFile);
  else args.push("--terms", "");
  if (files?.spellingsFile) args.push("--spellings", files.spellingsFile);
  return args;
}

/**
 * Write a vocabulary where stt can read it: key terms one per line (a term may
 * contain commas, which `--terms` would split on) and the spellings as the
 * JSON list stt applies to the finished transcript. The directory is private
 * (mkdtemp creates it 0700) and the caller removes it; when a write fails (a
 * full /tmp), it is removed here before the error goes on.
 */
export function writeVocabularyFiles(vocabulary: Vocabulary): VocabularyFiles {
  const dir = mkdtempSync(path.join(os.tmpdir(), "tubereader-stt-"));
  try {
    let termsFile: string | null = null;
    let spellingsFile: string | null = null;
    if (vocabulary.keyterms.length > 0) {
      termsFile = path.join(dir, "terms.txt");
      writeFileSync(termsFile, vocabulary.keyterms.join("\n") + "\n", { mode: 0o600 });
    }
    if (vocabulary.customSpelling.length > 0) {
      spellingsFile = path.join(dir, "spellings.json");
      writeFileSync(spellingsFile, JSON.stringify(vocabulary.customSpelling), { mode: 0o600 });
    }
    return { dir, termsFile, spellingsFile };
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * `stt transcribe --json` output as the app's transcript. stt allows a null
 * speaker and null times, the app's Utterance does not: a missing speaker is
 * "A" (it would otherwise count as a second speaker), a missing start is 0
 * and a missing end is the start. Milliseconds become seconds.
 */
export function parseTranscript(stdout: string): SttTranscript {
  let data: unknown;
  try {
    data = JSON.parse(stdout);
  } catch {
    data = undefined;
  }
  if (
    !isRecord(data) ||
    typeof data.text !== "string" ||
    !(data.utterances === undefined || Array.isArray(data.utterances))
  ) {
    throw new Error(
      `stt printed something other than a transcript (${stdout.length} characters on stdout)`
    );
  }
  const raw: unknown[] = Array.isArray(data.utterances) ? data.utterances : [];
  const utterances = raw.filter(isRecord).map((u) => {
    const start = numberOrNull(u.start_ms) ?? 0;
    return {
      speaker: typeof u.speaker === "string" && u.speaker ? u.speaker : "A",
      text: typeof u.text === "string" ? u.text : "",
      start: start / 1000,
      end: (numberOrNull(u.end_ms) ?? start) / 1000,
    };
  });
  return {
    provider: typeof data.provider === "string" ? data.provider : "stt",
    text: data.text,
    utterances,
  };
}

/** `stt check --json` output, or null when it is not that. */
export function parseCheck(stdout: string): SttCheck | null {
  let data: unknown;
  try {
    data = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (!isRecord(data) || typeof data.ok !== "boolean") return null;
  return {
    provider: typeof data.provider === "string" ? data.provider : "stt",
    ok: data.ok,
    problem: typeof data.problem === "string" ? data.problem : null,
    maxSeconds: numberOrNull(data.max_seconds),
  };
}

/**
 * Why a video is too long for the configured provider, or null. Checked
 * before anything is uploaded: stt would refuse it too when ffprobe can tell
 * the length, but only after starting, and this names the video's own length.
 */
export function durationProblem(duration: number | null, check: SttCheck): string | null {
  if (!duration || !check.maxSeconds || duration <= check.maxSeconds) return null;
  return (
    `The video is ${duration} s (${readableDuration(duration)}); ${check.provider} ` +
    `accepts at most ${check.maxSeconds} s (${readableDuration(check.maxSeconds)}). ` +
    `Nothing was uploaded.`
  );
}

/** stt's own last word on a failure: its final "stt: <message>" line. */
export function sttMessage(stderr: string): string | null {
  const lines = stderr
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("stt: "));
  return lines.at(-1) ?? null;
}

/** The error message for a run that did not exit 0. */
export function failureMessage(result: RunResult, deadlineMs: number): string {
  const line = sttMessage(result.stderr);
  if (result.timedOut) {
    return (
      `Transcription did not finish within ${readableDuration(deadlineMs / 1000)}, ` +
      `so stt was stopped` + (line ? ` (${line})` : "")
    );
  }
  if (line) return line;
  const how = result.code !== null ? `status ${result.code}` : `signal ${result.signal}`;
  const tail = result.stderr.trim().slice(-STDERR_TAIL_CHARS);
  return `stt exited with ${how}` + (tail ? `: ${tail}` : "");
}

/**
 * Whether a failed run is worth one more: transient, and not left behind. A
 * clipped line cannot say, so it gets no second run either; a plain transient
 * failure has had stt's own two retries by then.
 */
export function worthRetrying(result: RunResult): boolean {
  const line = sttMessage(result.stderr) ?? "";
  return result.code === EXIT_TRANSIENT && !LEFT_BEHIND.test(line) && !CLIPPED.test(line);
}

/**
 * The transcript a run stopped at the deadline had already written, or null.
 * stt writes and flushes the transcript before it deletes the provider job,
 * so the SIGTERM can land during that cleanup: stt finishes it and exits 143
 * ("SIGTERM arrived after the transcript was written"). JSON that parses is
 * the whole transcript, and it is already paid for.
 */
export function writtenTranscript(result: RunResult): SttTranscript | null {
  if (!result.timedOut || result.overflow || !result.stdout.trim()) return null;
  try {
    return parseTranscript(result.stdout);
  } catch {
    return null;
  }
}

/**
 * Run stt once and collect its output. At `timeoutMs` it gets SIGTERM, which
 * makes it delete the provider job before exiting, and SIGKILL `killGraceMs`
 * later if it has not exited by then.
 */
function run(
  bin: string,
  args: string[],
  timeoutMs: number,
  killGraceMs: number
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let overflow = false;
    let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
      killTimer = setTimeout(() => proc.kill("SIGKILL"), killGraceMs);
    }, timeoutMs);
    const stopTimers = () => {
      clearTimeout(timer);
      clearTimeout(killTimer);
    };

    proc.stdout.setEncoding("utf8");
    proc.stderr.setEncoding("utf8");
    proc.stdout.on("data", (d: string) => {
      if (overflow || stdout.length + d.length > MAX_STDOUT_CHARS) overflow = true;
      else stdout += d;
    });
    // Progress lines go to stderr too; only the tail can matter.
    proc.stderr.on("data", (d: string) => {
      stderr = (stderr + d).slice(-STDERR_KEEP_CHARS);
    });
    proc.on("close", (code, signal) => {
      stopTimers();
      resolve({ code, signal, stdout, stderr, timedOut, overflow });
    });
    proc.on("error", (err: NodeJS.ErrnoException) => {
      stopTimers();
      reject(
        new Error(
          err.code === "ENOENT"
            ? `${bin} not found: run ~/development/stt/install.sh, or point TUBEREADER_STT_BIN at stt`
            : `Cannot run ${bin}: ${err.message}`
        )
      );
    });
  });
}

/** The configured provider and its length limit; throws when stt cannot transcribe. */
async function checkStt(bin: string): Promise<SttCheck> {
  const result = await run(bin, ["check", "--json"], CHECK_TIMEOUT_MS, 2_000);
  const check = parseCheck(result.stdout);
  if (check && !check.ok) {
    throw new Error(`stt cannot transcribe: ${check.problem ?? sttMessage(result.stderr) ?? "unknown problem"}`);
  }
  if (result.code !== 0 || !check) {
    throw new Error(`stt check failed: ${failureMessage(result, CHECK_TIMEOUT_MS)}`);
  }
  return check;
}

/**
 * Transcribe one downloaded audio file through stt, with speaker labels. A
 * video longer than the provider accepts fails before anything is uploaded; a
 * transient failure gets one more run, unless stt says something may be left
 * at the provider; a transcript stt wrote before the deadline stopped it is
 * kept; any other failure throws with stt's own message.
 */
export async function transcribeWithStt(
  audioPath: string,
  request: { duration: number | null; vocabulary: Vocabulary | null },
  options: SttOptions = {}
): Promise<SttTranscript> {
  const bin = options.bin || process.env.TUBEREADER_STT_BIN || "stt";
  const deadlineMs = options.deadlineMs ?? DEADLINE_MS;
  const killGraceMs = options.killGraceMs ?? KILL_GRACE_MS;
  const retryPauseMs = options.retryPauseMs ?? RETRY_PAUSE_MS;

  const check = await checkStt(bin);
  const tooLong = durationProblem(request.duration, check);
  if (tooLong) throw new Error(tooLong);

  const deadline = Date.now() + deadlineMs;
  const files = request.vocabulary ? writeVocabularyFiles(request.vocabulary) : null;
  try {
    const args = transcribeArgs(audioPath, files);
    for (let attempt = 1; ; attempt++) {
      const result = await run(bin, args, Math.max(0, deadline - Date.now()), killGraceMs);
      if (result.code === 0 && !result.overflow) return parseTranscript(result.stdout);
      if (result.overflow) {
        throw new Error(`stt printed more than ${MAX_STDOUT_CHARS / 1024 / 1024} MB, which is not a transcript`);
      }
      const written = writtenTranscript(result);
      if (written) {
        const how =
          sttMessage(result.stderr) ??
          (result.signal ? `signal ${result.signal}` : `status ${result.code}`);
        console.error(`[pipeline] The deadline stopped stt after it wrote the transcript, which is kept (${how})`);
        return written;
      }
      const message = failureMessage(result, deadlineMs);
      if (
        attempt === 1 &&
        worthRetrying(result) &&
        deadline - Date.now() > retryPauseMs
      ) {
        console.error(`[pipeline] ${message}; running stt once more in ${retryPauseMs / 1000}s`);
        await sleep(retryPauseMs);
        continue;
      }
      throw new Error(attempt > 1 ? `${message} (after one retry)` : message);
    }
  } finally {
    if (files) rmSync(files.dir, { recursive: true, force: true });
  }
}
