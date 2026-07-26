import { EventEmitter } from "events";
import { db, schema } from "@/lib/db";
import { eq, inArray } from "drizzle-orm";
import { extractMetadata } from "./metadata";
import { downloadAudio } from "./download";
import { transcribeAudio } from "./transcribe";
import { summarizeTranscript } from "./summarize";
import { config } from "../config";
import type { PipelineEvent, VideoStatus } from "../types";

const MINUTE = 60_000;

// Backstop timeout per stage. Every stage already bounds its own work (yt-dlp
// is spawned with a 60s/600s timeout, AssemblyAI polling gives up after 30min,
// the claude CLI after 300s per attempt), so these budgets are deliberately
// longer: whenever a stage is merely slow, its own error message should win.
// They exist for the stage promise that never settles at all — a child that
// ignores SIGTERM, a fetch with no deadline — which otherwise freezes the video
// and holds one of config.maxConcurrency slots until the server is restarted.
const STAGE_TIMEOUT_MS = {
  metadata: 3 * MINUTE, // yt-dlp --dump-json, own timeout 60s
  download: 15 * MINUTE, // yt-dlp -x, own timeout 600s
  transcribe: 45 * MINUTE, // 30min poll ceiling + upload/submit fetches, which have none
  summarize: 15 * MINUTE, // claude CLI, 300s x 2 attempts
} as const;

type Stage = keyof typeof STAGE_TIMEOUT_MS;

/**
 * Race a stage against its backstop timeout. The stage promise cannot be
 * cancelled — it is left to settle (or never settle) on its own, and a late
 * rejection is absorbed by the race — but the video stops waiting on it and
 * gives its concurrency slot back.
 */
function withStageTimeout<T>(stage: Stage, work: Promise<T>): Promise<T> {
  const ms = STAGE_TIMEOUT_MS[stage];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const backstop = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `Pipeline stage "${stage}" timed out after ${ms / MINUTE}min`
          )
        ),
      ms
    );
  });
  return Promise.race([work, backstop]).finally(() => clearTimeout(timer));
}

class Orchestrator extends EventEmitter {
  private running = new Set<number>();
  private queue: number[] = [];
  private started = false;

  constructor() {
    super();
    this.setMaxListeners(100);
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.resumeStuckJobs();
  }

  private resumeStuckJobs() {
    const nonTerminal: VideoStatus[] = [
      "pending",
      "metadata",
      "downloading",
      "transcribing",
      "summarizing",
    ];
    const stuck = db
      .select()
      .from(schema.videos)
      .where(inArray(schema.videos.status, nonTerminal))
      .all();

    for (const video of stuck) {
      db.update(schema.videos)
        .set({ status: "pending" })
        .where(eq(schema.videos.id, video.id))
        .run();
      this.enqueue(video.id);
    }
  }

  enqueue(videoId: number) {
    if (this.running.has(videoId) || this.queue.includes(videoId)) return;
    this.queue.push(videoId);
    this.drain();
  }

  private drain() {
    while (
      this.running.size < config.maxConcurrency &&
      this.queue.length > 0
    ) {
      const videoId = this.queue.shift()!;
      this.running.add(videoId);
      this.processVideo(videoId)
        .catch((err) => {
          // processVideo records stage failures itself; reaching here means the
          // failure bookkeeping threw too. Swallow it so an unhandled rejection
          // can't take the server down and the slot is still released below.
          console.error(
            `[pipeline] video ${videoId}:`,
            err instanceof Error ? err.message : err
          );
        })
        .finally(() => {
          this.running.delete(videoId);
          this.drain();
        });
    }
  }

  private emitEvent(videoId: number, status: VideoStatus, extra?: Partial<PipelineEvent>) {
    const video = db
      .select()
      .from(schema.videos)
      .where(eq(schema.videos.id, videoId))
      .get();

    const event: PipelineEvent = {
      videoId,
      youtubeId: video?.youtube_id || "",
      status,
      title: video?.title || undefined,
      ...extra,
    };
    this.emit("pipeline", event);
  }

  private async processVideo(videoId: number) {
    try {
      // Stage 1: Metadata
      this.emitEvent(videoId, "pending");
      await withStageTimeout("metadata", extractMetadata(videoId));
      this.emitEvent(videoId, "metadata");

      // Stage 2: Download
      const audioPath = await withStageTimeout("download", downloadAudio(videoId));
      this.emitEvent(videoId, "downloading");

      // Stage 3: Transcribe
      await withStageTimeout("transcribe", transcribeAudio(videoId, audioPath));
      this.emitEvent(videoId, "transcribing");

      // Stage 4: Summarize
      await withStageTimeout("summarize", summarizeTranscript(videoId));
      this.emitEvent(videoId, "complete");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      db.update(schema.videos)
        .set({ status: "error", error_message: message })
        .where(eq(schema.videos.id, videoId))
        .run();
      this.emitEvent(videoId, "error", { error: message });
    }
  }
}

const globalForOrchestrator = globalThis as typeof globalThis & {
  __tubereader_orchestrator?: Orchestrator;
};

export function getOrchestrator(): Orchestrator {
  if (!globalForOrchestrator.__tubereader_orchestrator) {
    globalForOrchestrator.__tubereader_orchestrator = new Orchestrator();
  }
  const orch = globalForOrchestrator.__tubereader_orchestrator;
  orch.start();
  return orch;
}
