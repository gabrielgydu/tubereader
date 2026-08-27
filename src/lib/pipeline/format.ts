import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { runClaude } from "./claude";
import { exportVideoMarkdown } from "./export-video-md";
import type { Utterance } from "../types";

// Keep chunks small enough that the model can echo them back verbatim.
const CHUNK_SIZE = 18_000;

const SYSTEM_PROMPT = `You are a transcript formatter. You receive a chunk of a raw spoken-word transcript and return the EXACT same text reorganized for reading:

- Insert paragraph breaks (blank lines) at natural thought boundaries. Aim for paragraphs of 2-6 sentences.
- Insert markdown "## " section headings where the topic clearly shifts. Headings must be short (2-6 words) and in the SAME LANGUAGE as the transcript. Roughly one heading every 4-10 paragraphs — only at real topic shifts.
- Do NOT change, add, remove, or reorder ANY words or punctuation of the transcript. The only allowed additions are paragraph breaks and heading lines.
- If speaker labels like "Speaker A:" appear, keep every one of them, bolded as **Speaker A:**.
- Return ONLY the formatted transcript. No commentary, no code fences.`;

/** Strip headings, bold markers, and everything but letters/digits for verbatim comparison. */
function normalize(s: string): string {
  return s
    .replace(/^#{1,6} .*$/gm, "")
    .replace(/\*/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function splitIntoChunks(text: string, multiSpeaker: boolean): string[] {
  if (text.length <= CHUNK_SIZE) return [text];
  // Multi-speaker text is one utterance per line; plain text splits on sentences.
  const units = multiSpeaker ? text.split("\n") : text.split(/(?<=[.!?…])\s+/);
  const sep = multiSpeaker ? "\n" : " ";
  const chunks: string[] = [];
  let current = "";
  for (const unit of units) {
    if (current && current.length + unit.length + 1 > CHUNK_SIZE) {
      chunks.push(current);
      current = unit;
    } else {
      current = current ? current + sep + unit : unit;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function formatChunk(
  chunk: string,
  index: number,
  total: number
): Promise<string> {
  const continuation =
    index > 0
      ? "\nThis chunk continues a longer transcript and may begin mid-topic. Only start with a heading if a new topic begins here.\n"
      : "";
  const input = `Transcript chunk ${index + 1} of ${total}:${continuation}\n${chunk}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = (
        await runClaude({ systemPrompt: SYSTEM_PROMPT, input })
      ).trim();
      if (normalize(out) === normalize(chunk)) return out;
      console.error(
        `[format] chunk ${index + 1}/${total} failed verbatim check (attempt ${attempt + 1})`
      );
    } catch (err) {
      console.error(
        `[format] chunk ${index + 1}/${total} attempt ${attempt + 1}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  // Give up on this chunk — keep the raw text so no content is lost.
  return chunk;
}

const inFlight = new Set<number>();

/**
 * Reformat a video's raw transcript into readable markdown (paragraphs +
 * section headings) without changing its content. Stores the result in
 * `formatted_transcript`. Safe to call while the video is already complete.
 */
export async function formatTranscript(videoId: number): Promise<void> {
  if (inFlight.has(videoId)) return;
  inFlight.add(videoId);
  try {
    const video = db
      .select()
      .from(schema.videos)
      .where(eq(schema.videos.id, videoId))
      .get();

    if (!video) throw new Error(`Video ${videoId} not found`);
    if (!video.transcript) throw new Error(`Video ${videoId} has no transcript`);

    // Multi-speaker videos are formatted from speaker-labeled utterances so
    // the labels survive into the reading view.
    let source = video.transcript;
    let multiSpeaker = false;
    if (video.utterances) {
      try {
        const utterances: Utterance[] = JSON.parse(video.utterances);
        const speakers = new Set(utterances.map((u) => u.speaker));
        if (speakers.size > 1) {
          multiSpeaker = true;
          source = utterances
            .map((u) => `Speaker ${u.speaker}: ${u.text}`)
            .join("\n");
        }
      } catch {
        // fall back to the raw transcript
      }
    }

    const chunks = splitIntoChunks(source, multiSpeaker);
    const formatted: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      formatted.push(await formatChunk(chunks[i], i, chunks.length));
    }

    db.update(schema.videos)
      .set({ formatted_transcript: formatted.join("\n\n") })
      .where(eq(schema.videos.id, videoId))
      .run();

    // Refresh the markdown mirror so it carries the readable version.
    exportVideoMarkdown(videoId);
  } finally {
    inFlight.delete(videoId);
  }
}
