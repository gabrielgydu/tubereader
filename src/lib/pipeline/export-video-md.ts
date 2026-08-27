import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { writeVideoMarkdown } from "./export-md";

/**
 * Mirror a video to its markdown file, best-effort. The file is a convenience
 * copy of what the DB already holds, so a failure here (read-only home, full
 * disk) is logged and swallowed rather than failing the video.
 */
export function exportVideoMarkdown(videoId: number): string | null {
  try {
    const video = db
      .select()
      .from(schema.videos)
      .where(eq(schema.videos.id, videoId))
      .get();

    if (!video) return null;
    return writeVideoMarkdown(video);
  } catch (err) {
    console.error(
      `[export-md] video ${videoId}:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
