import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getOrchestrator } from "@/lib/pipeline/orchestrator";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const videoId = parseInt(id);

  const video = db
    .select()
    .from(schema.videos)
    .where(eq(schema.videos.id, videoId))
    .get();

  if (!video) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  db.update(schema.videos)
    .set({ status: "pending", error_message: null })
    .where(eq(schema.videos.id, videoId))
    .run();

  const orchestrator = getOrchestrator();
  orchestrator.enqueue(videoId);

  return NextResponse.json({ ok: true });
}
