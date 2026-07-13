import { readFileSync, unlinkSync, existsSync } from "fs";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { config } from "../config";

const API_BASE = "https://api.assemblyai.com/v2";

// AssemblyAI occasionally returns a transient failure (a 5xx, a 429, a dropped
// connection, or — as observed — a 200 /upload response with no upload_url).
// Retry those a few times so a blip doesn't kill an otherwise-good video.
const MAX_UPLOAD_ATTEMPTS = 3;
const MAX_SUBMIT_ATTEMPTS = 3;
const MAX_POLL_FAILURES = 5;
// Hard ceiling on how long we wait for a single transcript, so a job wedged
// server-side in "processing" can't hang the pipeline forever.
const MAX_POLL_MS = 30 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 429 (rate limit) and 5xx are worth retrying; other 4xx are deterministic
// client errors (bad key, unsupported request) that fail identically on retry.
const isTransientStatus = (status: number) => status === 429 || status >= 500;

// A deterministic failure that must NOT be retried and should propagate as-is.
class FatalTranscribeError extends Error {}

async function apiRequest(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      authorization: config.assemblyAIKey,
      "content-type": "application/json",
      ...options.headers,
    },
  });
}

async function uploadAudio(filePath: string): Promise<string> {
  const data = readFileSync(filePath);
  let lastError = "unknown error";

  for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        headers: {
          authorization: config.assemblyAIKey,
          "content-type": "application/octet-stream",
        },
        body: data,
      });
      const body = await res.text();

      if (res.ok) {
        let uploadUrl: unknown;
        try {
          uploadUrl = JSON.parse(body).upload_url;
        } catch {
          uploadUrl = undefined;
        }
        // A 200 with no usable upload_url is the exact failure that used to
        // slip through and resurface as a misleading "Submit failed: 400"
        // (the submit went out with audio_url === undefined). Never submit
        // without a validated URL — retry, since this has been transient.
        if (typeof uploadUrl === "string" && uploadUrl.length > 0) {
          return uploadUrl;
        }
        lastError = `200 OK but no upload_url in response: ${body.slice(0, 300)}`;
      } else {
        const detail = `HTTP ${res.status}: ${body.slice(0, 300)}`;
        if (!isTransientStatus(res.status)) {
          throw new FatalTranscribeError(`AssemblyAI upload failed: ${detail}`);
        }
        lastError = detail;
      }
    } catch (err) {
      if (err instanceof FatalTranscribeError) throw err;
      lastError = err instanceof Error ? err.message : String(err);
    }

    if (attempt < MAX_UPLOAD_ATTEMPTS) await sleep(1000 * attempt);
  }

  throw new Error(
    `AssemblyAI upload failed after ${MAX_UPLOAD_ATTEMPTS} attempts: ${lastError}`
  );
}

async function submitTranscript(uploadUrl: string): Promise<string> {
  let lastError = "unknown error";

  for (let attempt = 1; attempt <= MAX_SUBMIT_ATTEMPTS; attempt++) {
    try {
      const res = await apiRequest("/transcript", {
        method: "POST",
        body: JSON.stringify({
          audio_url: uploadUrl,
          speaker_labels: true,
          language_detection: true,
        }),
      });
      const body = await res.text();

      if (res.ok) {
        let id: unknown;
        try {
          id = JSON.parse(body).id;
        } catch {
          id = undefined;
        }
        if (typeof id === "string" && id.length > 0) return id;
        lastError = `200 OK but no transcript id in response: ${body.slice(0, 300)}`;
      } else {
        const detail = `HTTP ${res.status}: ${body.slice(0, 300)}`;
        // Deterministic client errors won't get better on retry — fail fast.
        if (!isTransientStatus(res.status)) {
          throw new FatalTranscribeError(`AssemblyAI submit failed: ${detail}`);
        }
        lastError = detail;
      }
    } catch (err) {
      if (err instanceof FatalTranscribeError) throw err;
      lastError = err instanceof Error ? err.message : String(err);
    }

    if (attempt < MAX_SUBMIT_ATTEMPTS) await sleep(1000 * attempt);
  }

  throw new Error(
    `AssemblyAI submit failed after ${MAX_SUBMIT_ATTEMPTS} attempts: ${lastError}`
  );
}

async function pollTranscript(transcriptId: string): Promise<{
  text?: string;
  utterances?: { speaker: string; text: string; start: number; end: number }[];
}> {
  let pollFailures = 0;
  const deadline = Date.now() + MAX_POLL_MS;

  while (true) {
    await sleep(5000);

    if (Date.now() > deadline) {
      throw new Error(
        `AssemblyAI transcription timed out after ${MAX_POLL_MS / 60000}min (transcript ${transcriptId})`
      );
    }

    let result: {
      status: string;
      text?: string;
      error?: string;
      utterances?: {
        speaker: string;
        text: string;
        start: number;
        end: number;
      }[];
    };
    try {
      const pollRes = await apiRequest(`/transcript/${transcriptId}`);
      if (!pollRes.ok) {
        const body = await pollRes.text().catch(() => "");
        const detail = `HTTP ${pollRes.status}: ${body.slice(0, 200)}`;
        // A 404 (unknown id) / 401 (revoked key) won't recover — fail fast.
        if (!isTransientStatus(pollRes.status)) {
          throw new FatalTranscribeError(
            `AssemblyAI poll failed for transcript ${transcriptId}: ${detail}`
          );
        }
        throw new Error(detail);
      }
      result = await pollRes.json();
      pollFailures = 0;
    } catch (err) {
      if (err instanceof FatalTranscribeError) throw err;
      pollFailures++;
      if (pollFailures >= MAX_POLL_FAILURES) {
        throw new Error(
          `AssemblyAI poll failed ${MAX_POLL_FAILURES}x for transcript ${transcriptId}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
      continue;
    }

    if (result.status === "completed") {
      return { text: result.text, utterances: result.utterances };
    }
    if (result.status === "error") {
      throw new Error(`Transcription failed: ${result.error}`);
    }
    // queued / processing — keep polling until the deadline.
  }
}

export async function transcribeAudio(
  videoId: number,
  audioPath: string
): Promise<void> {
  const video = db
    .select()
    .from(schema.videos)
    .where(eq(schema.videos.id, videoId))
    .get();

  if (!video) throw new Error(`Video ${videoId} not found`);

  db.update(schema.videos)
    .set({ status: "transcribing" })
    .where(eq(schema.videos.id, videoId))
    .run();

  try {
    const uploadUrl = await uploadAudio(audioPath);
    const transcriptId = await submitTranscript(uploadUrl);
    const { text, utterances: rawUtterances } = await pollTranscript(transcriptId);

    const utterances = (rawUtterances || []).map((u) => ({
      speaker: u.speaker,
      text: u.text,
      start: u.start / 1000,
      end: u.end / 1000,
    }));

    db.update(schema.videos)
      .set({
        transcript: text,
        utterances: JSON.stringify(utterances),
      })
      .where(eq(schema.videos.id, videoId))
      .run();
  } finally {
    // Release the downloaded audio regardless of success or failure so temp
    // files can't accumulate on the error paths. A retry re-downloads it.
    if (existsSync(audioPath)) unlinkSync(audioPath);
  }
}
