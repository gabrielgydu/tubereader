import { EventEmitter } from "events";
import { db, schema } from "@/lib/db";
import { eq, inArray } from "drizzle-orm";
import { extractMetadata } from "./metadata";
import { downloadAudio } from "./download";
import { transcribeAudio } from "./transcribe";
import { summarizeTranscript } from "./summarize";
import { config } from "../config";
import type { PipelineEvent, VideoStatus } from "../types";

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
      this.processVideo(videoId).finally(() => {
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
      await extractMetadata(videoId);
      this.emitEvent(videoId, "metadata");

      // Stage 2: Download
      const audioPath = await downloadAudio(videoId);
      this.emitEvent(videoId, "downloading");

      // Stage 3: Transcribe
      await transcribeAudio(videoId, audioPath);
      this.emitEvent(videoId, "transcribing");

      // Stage 4: Summarize
      await summarizeTranscript(videoId);
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
