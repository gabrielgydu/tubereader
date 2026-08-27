import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { writeVideoMarkdown } from "@/lib/pipeline/export-md";
import { notasUrl } from "@/lib/notas";

/**
 * Send the browser to this video's markdown mirror in the notas reader.
 *
 * The mirror is rewritten first, so the tab always shows what the DB holds now
 * even if the file was never written or has gone stale, and the notas URL is
 * built here rather than in the client — the mapping needs the export
 * directory and $HOME, neither of which the browser knows.
 *
 * This is navigated to directly, so failures answer in plain text: a JSON
 * error blob in a new tab tells the reader nothing.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const video = db
    .select()
    .from(schema.videos)
    .where(eq(schema.videos.id, parseInt(id)))
    .get();

  if (!video) {
    return new NextResponse("Video not found", { status: 404 });
  }

  let file: string | null;
  try {
    file = writeVideoMarkdown(video);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new NextResponse(`Could not write the markdown mirror: ${message}`, {
      status: 500,
    });
  }

  if (!file) {
    return new NextResponse("This video has no transcript to export yet", {
      status: 409,
    });
  }

  const url = notasUrl(file);
  if (!url) {
    return new NextResponse(
      `notas can only open files under $HOME, and this one is at ${file}. ` +
        "Point TUBEREADER_MD_DIR somewhere inside $HOME to link videos into it.",
      { status: 409 }
    );
  }

  return NextResponse.redirect(url);
}
