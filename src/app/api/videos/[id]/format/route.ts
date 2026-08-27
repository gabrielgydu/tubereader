import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { formatTranscript } from "@/lib/pipeline/format";

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
  if (!video.transcript) {
    return NextResponse.json({ error: "No transcript" }, { status: 400 });
  }

  // Fire and forget — the client polls the video endpoint until
  // formatted_transcript appears.
  formatTranscript(videoId).catch((err) =>
    console.error(
      `[format] video ${videoId}:`,
      err instanceof Error ? err.message : err
    )
  );

  return NextResponse.json({ ok: true });
}
