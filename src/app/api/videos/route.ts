import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { desc, eq, asc, isNull, isNotNull, and } from "drizzle-orm";
import { parseSource } from "@/lib/source";
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

  const results: { youtube_id: string; id: number; new: boolean }[] = [];
  const toProcess: number[] = [];

  for (const url of urls) {
    if (typeof url !== "string") continue;
    const source = parseSource(url.trim());
    if (!source) continue;

    const existing = db
      .select()
      .from(schema.videos)
      .where(eq(schema.videos.youtube_id, source.sourceId))
      .get();

    if (existing) {
      results.push({ youtube_id: source.sourceId, id: existing.id, new: false });
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

    results.push({ youtube_id: source.sourceId, id: inserted.id, new: true });
    toProcess.push(inserted.id);
  }

  if (toProcess.length > 0) {
    const orchestrator = getOrchestrator();
    for (const id of toProcess) {
      orchestrator.enqueue(id);
    }
  }

  return NextResponse.json(results, { status: 201 });
}
