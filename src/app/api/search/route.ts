import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.trim().length === 0) {
    return NextResponse.json([]);
  }

  const rawDb = db.$client;

  const ftsQuery = q
    .split(/\s+/)
    .map((w) => `"${w.replace(/"/g, "")}"`)
    .join(" ");

  try {
    const results = rawDb
      .prepare(
        `SELECT v.*, snippet(videos_fts, 3, '<mark>', '</mark>', '...', 40) as snippet
         FROM videos_fts fts
         JOIN videos v ON v.id = fts.rowid
         WHERE videos_fts MATCH ?
         ORDER BY rank
         LIMIT 50`
      )
      .all(ftsQuery);

    return NextResponse.json(results);
  } catch {
    return NextResponse.json([]);
  }
}
