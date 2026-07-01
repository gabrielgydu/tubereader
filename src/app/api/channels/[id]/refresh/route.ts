import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { execFile } from "child_process";
import { promisify } from "util";
import { getOrchestrator } from "@/lib/pipeline/orchestrator";
import { extractYouTubeId } from "@/lib/format";
import { enumerateReels } from "@/lib/pipeline/instagram";
import { config } from "@/lib/config";

const execFileAsync = promisify(execFile);

type Channel = typeof schema.channels.$inferSelect;

/** Insert a video if new, enqueue it, and record its source id in `queued`. */
function ingest(
  values: {
    youtube_id: string;
    platform: string;
    source_url: string;
    channel_id: string;
  },
  orchestrator: ReturnType<typeof getOrchestrator>,
  queued: string[]
) {
  const existing = db
    .select()
    .from(schema.videos)
    .where(eq(schema.videos.youtube_id, values.youtube_id))
    .get();
  if (existing) return;

  const inserted = db
    .insert(schema.videos)
    .values({
      youtube_id: values.youtube_id,
      platform: values.platform,
      source_url: values.source_url,
      channel_id: values.channel_id,
      status: "pending",
      created_at: new Date().toISOString(),
    })
    .returning()
    .get();

  orchestrator.enqueue(inserted.id);
  queued.push(values.youtube_id);
}

async function refreshInstagram(
  channel: Channel,
  orchestrator: ReturnType<typeof getOrchestrator>,
  queued: string[]
) {
  const reels = await enumerateReels(channel.url, config.channelRefreshLimit);
  for (const reel of reels) {
    ingest(
      {
        youtube_id: reel.shortcode,
        platform: "instagram",
        source_url: reel.url,
        channel_id: channel.channel_id,
      },
      orchestrator,
      queued
    );
  }
}

async function refreshYouTube(
  channel: Channel,
  orchestrator: ReturnType<typeof getOrchestrator>,
  queued: string[]
) {
  const { stdout } = await execFileAsync(
    "yt-dlp",
    [
      "--flat-playlist",
      "--dump-json",
      "--playlist-end", String(config.channelRefreshLimit),
      "--",
      channel.url,
    ],
    { maxBuffer: 10 * 1024 * 1024, timeout: 60_000 }
  );

  for (const line of stdout.trim().split("\n")) {
    try {
      const entry = JSON.parse(line);
      const videoId = entry.id || extractYouTubeId(entry.url || "");
      if (!videoId) continue;
      ingest(
        {
          youtube_id: videoId,
          platform: "youtube",
          source_url: `https://www.youtube.com/watch?v=${videoId}`,
          channel_id: channel.channel_id,
        },
        orchestrator,
        queued
      );
    } catch {
      // skip unparseable lines
    }
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const channel = db
    .select()
    .from(schema.channels)
    .where(eq(schema.channels.id, parseInt(id)))
    .get();

  if (!channel) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const orchestrator = getOrchestrator();
    const queued: string[] = [];

    if (channel.platform === "instagram") {
      await refreshInstagram(channel, orchestrator, queued);
    } else {
      await refreshYouTube(channel, orchestrator, queued);
    }

    db.update(schema.channels)
      .set({ last_checked: new Date().toISOString() })
      .where(eq(schema.channels.id, parseInt(id)))
      .run();

    return NextResponse.json({ queued: queued.length, videoIds: queued });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Refresh failed" },
      { status: 500 }
    );
  }
}
