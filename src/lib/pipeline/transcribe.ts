import { readFileSync, unlinkSync, existsSync } from "fs";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { config } from "../config";

const API_BASE = "https://api.assemblyai.com/v2";

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
  const res = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    headers: {
      authorization: config.assemblyAIKey,
      "content-type": "application/octet-stream",
    },
    body: data,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  const json = await res.json();
  return json.upload_url;
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

  const uploadUrl = await uploadAudio(audioPath);

  const submitRes = await apiRequest("/transcript", {
    method: "POST",
    body: JSON.stringify({
      audio_url: uploadUrl,
      speaker_labels: true,
      language_detection: true,
    }),
  });
  if (!submitRes.ok) throw new Error(`Submit failed: ${submitRes.status}`);

  const { id: transcriptId } = await submitRes.json();

  // Poll until complete
  while (true) {
    await new Promise((r) => setTimeout(r, 5000));

    const pollRes = await apiRequest(`/transcript/${transcriptId}`);
    if (!pollRes.ok) throw new Error(`Poll failed: ${pollRes.status}`);

    const result = await pollRes.json();

    if (result.status === "completed") {
      const utterances = (result.utterances || []).map(
        (u: { speaker: string; text: string; start: number; end: number }) => ({
          speaker: u.speaker,
          text: u.text,
          start: u.start / 1000,
          end: u.end / 1000,
        })
      );

      db.update(schema.videos)
        .set({
          transcript: result.text,
          utterances: JSON.stringify(utterances),
        })
        .where(eq(schema.videos.id, videoId))
        .run();

      break;
    }

    if (result.status === "error") {
      throw new Error(`Transcription failed: ${result.error}`);
    }
  }

  // Clean up audio file
  if (existsSync(audioPath)) {
    unlinkSync(audioPath);
  }
}
