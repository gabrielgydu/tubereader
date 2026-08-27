import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { desc, eq, asc, isNull, isNotNull, and } from "drizzle-orm";
import type { RejectedUrl } from "@/lib/source";
import { resolveSource } from "@/lib/resolve-source";
import { getOrchestrator } from "@/lib/pipeline/orchestrator";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const status = params.get("status");
  const category = params.get("category");
  const channelId = params.get("channelId");
  const sort = params.get("sort") || "created";
  const read = params.get("read");

  let query = db.select().from(schema.videos).$dynamic();

  const conditions = [];

  if (read === "true") {
    conditions.push(isNotNull(schema.videos.read_at));
  } else if (read !== "all") {
    conditions.push(isNull(schema.videos.read_at));
  }

  if (status) {
    conditions.push(eq(schema.videos.status, status));
  } else if (category) {
    conditions.push(eq(schema.videos.category, category));
  } else if (channelId) {
    conditions.push(eq(schema.videos.channel_id, channelId));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const orderCol =
    sort === "date"
      ? schema.videos.upload_date
      : sort === "duration"
        ? schema.videos.duration
        : schema.videos.created_at;

  const rows = query.orderBy(
    sort === "duration" ? asc(orderCol) : desc(orderCol)
  ).all();

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const urls = (body as { urls?: unknown } | null)?.urls;

  if (!Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json({ error: "urls array required" }, { status: 400 });
  }

  const accepted: { youtube_id: string; id: number; new: boolean }[] = [];
  const rejected: RejectedUrl[] = [];
  const toProcess: number[] = [];

  // Resolution can hit the network (short links), so run it for the whole batch
  // at once — one slow shortener then can't delay the rest.
  const resolutions = await Promise.all(
    urls.map(async (url) => {
      const trimmed = typeof url === "string" ? url.trim() : "";
      return trimmed
        ? { url: trimmed, resolved: await resolveSource(trimmed) }
        : { url: String(url), resolved: null };
    })
  );

  for (const { url, resolved } of resolutions) {
    if (!resolved) {
      rejected.push({ url, reason: "unsupported", message: "not a URL" });
      continue;
    }
    if (!resolved.ok) {
      rejected.push({ url, reason: resolved.reason, message: resolved.message });
      continue;
    }
    const source = resolved.source;

    const existing = db
      .select()
      .from(schema.videos)
      .where(eq(schema.videos.youtube_id, source.sourceId))
      .get();

    if (existing) {
      accepted.push({ youtube_id: source.sourceId, id: existing.id, new: false });
      if (existing.status === "error") {
        db.update(schema.videos)
          .set({ status: "pending", error_message: null })
          .where(eq(schema.videos.id, existing.id))
          .run();
        toProcess.push(existing.id);
      }
      continue;
    }

    const inserted = db
      .insert(schema.videos)
      .values({
        youtube_id: source.sourceId,
        platform: source.platform,
        source_url: source.sourceUrl,
        status: "pending",
        created_at: new Date().toISOString(),
      })
      .returning()
      .get();

    accepted.push({ youtube_id: source.sourceId, id: inserted.id, new: true });
    toProcess.push(inserted.id);
  }

  if (toProcess.length > 0) {
    const orchestrator = getOrchestrator();
    for (const id of toProcess) {
      orchestrator.enqueue(id);
    }
  }

  // A mixed batch still enqueues what it can; nothing usable is a client error.
  // `error` summarises the rejections for callers that only read that field.
  if (accepted.length === 0) {
    return NextResponse.json(
      {
        accepted,
        rejected,
        error:
          rejected.length === 1
            ? rejected[0].message
            : `all ${rejected.length} URLs rejected`,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ accepted, rejected }, { status: 201 });
}
