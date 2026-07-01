import { spawn } from "child_process";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { config } from "../config";
import type { SummaryResult } from "../types";

const SYSTEM_PROMPT = `You are a video summarizer. Analyze the transcript and return ONLY valid JSON matching this schema:

{
  "verdict": "One sentence answering: should I watch this? Be direct and opinionated.",
  "category": "One of: tutorial, opinion, interview, demo, news, review, entertainment, lecture, documentary, other",
  "keyTakeaways": ["3-7 bullet points of the most important insights or facts"],
  "summary": "Structured markdown summary. Use ## headers for major sections. If chapters are provided, structure around them. 200-500 words.",
  "timestamps": [{"time": <seconds>, "label": "short label", "description": "what happens here"}]
}

IMPORTANT: Write the verdict, keyTakeaways, summary, and timestamp labels in the SAME LANGUAGE as the transcript. If the transcript is in Portuguese, write everything in Portuguese. If English, write in English. Match the language exactly.

Return ONLY the JSON object, no markdown fences, no explanation.`;

function runClaude(userPrompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "claude",
      [
        "-p", "-",
        "--model", "sonnet",
        "--output-format", "json",
        "--system-prompt", SYSTEM_PROMPT,
      ],
      { timeout: 300_000 }
    );

    const chunks: Buffer[] = [];
    proc.stdout.on("data", (d) => chunks.push(d));

    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d));

    proc.on("close", (code) => {
      const stdout = Buffer.concat(chunks).toString();
      if (stdout.trim()) resolve(stdout);
      else reject(new Error(`claude exited ${code}: ${stderr.slice(-500)}`));
    });
    proc.on("error", reject);

    proc.stdin.write(userPrompt);
    proc.stdin.end();
  });
}

export async function summarizeTranscript(videoId: number): Promise<void> {
  const video = db
    .select()
    .from(schema.videos)
    .where(eq(schema.videos.id, videoId))
    .get();

  if (!video) throw new Error(`Video ${videoId} not found`);
  if (!video.transcript) throw new Error(`Video ${videoId} has no transcript`);

  db.update(schema.videos)
    .set({ status: "summarizing" })
    .where(eq(schema.videos.id, videoId))
    .run();

  const transcript = video.transcript.slice(0, config.maxTranscriptLength);

  let chaptersContext = "";
  if (video.chapters) {
    try {
      const chapters = JSON.parse(video.chapters);
      chaptersContext = `\n\nVideo chapters:\n${chapters
        .map(
          (c: { start_time: number; title: string }) =>
            `- ${Math.floor(c.start_time)}s: ${c.title}`
        )
        .join("\n")}`;
    } catch {
      // ignore
    }
  }

  const userPrompt = `Video: "${video.title}" by ${video.channel}
Duration: ${video.duration ? Math.floor(video.duration / 60) + " minutes" : "unknown"}${chaptersContext}

Transcript:
${transcript}`;

  let result: SummaryResult | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const stdout = await runClaude(userPrompt);
      const parsed = JSON.parse(stdout);
      const resultText = parsed.result;
      let inner: SummaryResult;

      if (typeof resultText === "string") {
        // Strip markdown fences if present
        const cleaned = resultText
          .replace(/^```json\s*/i, "")
          .replace(/```\s*$/, "")
          .trim();
        inner = JSON.parse(cleaned);
      } else {
        inner = resultText || parsed;
      }

      // Normalize timestamps — Claude sometimes returns "M:SS" strings instead of seconds
      if (inner.timestamps) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inner.timestamps = inner.timestamps.map((ts: any) => {
          let time: number = ts.time;
          if (typeof ts.time === "string") {
            const parts = ts.time.split(":").map(Number);
            time =
              parts.length === 3
                ? parts[0] * 3600 + parts[1] * 60 + parts[2]
                : parts.length === 2
                  ? parts[0] * 60 + parts[1]
                  : parts[0] || 0;
          }
          return { time, label: ts.label || "", description: ts.description || ts.label || "" };
        });
      }

      result = inner;
      break;
    } catch (err) {
      console.error(
        `[summarize] attempt ${attempt + 1} failed for video ${videoId}:`,
        err instanceof Error ? err.message : err
      );
      if (attempt === 1) {
        db.update(schema.videos)
          .set({
            verdict: "Summary generation failed — transcript is available for manual review.",
            summary: video.transcript.slice(0, 2000),
            category: "other",
            key_takeaways: JSON.stringify(["Automatic summarization failed"]),
            timestamps: JSON.stringify([]),
            status: "complete",
            processed_at: new Date().toISOString(),
          })
          .where(eq(schema.videos.id, videoId))
          .run();
        return;
      }
    }
  }

  if (result) {
    db.update(schema.videos)
      .set({
        verdict: result.verdict,
        summary: result.summary,
        category: result.category,
        key_takeaways: JSON.stringify(result.keyTakeaways || []),
        timestamps: JSON.stringify(result.timestamps || []),
        status: "complete",
        processed_at: new Date().toISOString(),
      })
      .where(eq(schema.videos.id, videoId))
      .run();
  }
}
