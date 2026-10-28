import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { sql, desc } from "drizzle-orm";
import type { LibraryChannel } from "@/lib/types";

/**
 * Channels derived from the videos already in the library, grouped by
 * channel_id. Lets you browse everything from one channel without subscribing
 * to it (which would start pulling its whole back catalog on refresh).
 *
 * channel_id is always populated by the pipeline; the display name can be
 * blank on some rows, so we take the best non-empty name per channel and fall
 * back to the id.
 */
export async function GET() {
  const grouped = db
    .select({
      channel_id: schema.videos.channel_id,
      name: sql<string | null>`max(nullif(${schema.videos.channel}, ''))`,
      platform: sql<string>`max(${schema.videos.platform})`,
      count: sql<number>`count(*)`,
    })
    .from(schema.videos)
    .where(
      sql`${schema.videos.channel_id} is not null and ${schema.videos.channel_id} != ''`
    )
    .groupBy(schema.videos.channel_id)
    .orderBy(desc(sql`count(*)`))
    .all();

  const subscribed = new Set(
    db
      .select({ channel_id: schema.channels.channel_id })
      .from(schema.channels)
      .all()
      .map((r) => r.channel_id)
  );

  const channels: LibraryChannel[] = grouped.map((g) => ({
    channel_id: g.channel_id as string,
    name: g.name || (g.channel_id as string),
    platform: g.platform,
    count: g.count,
    subscribed: subscribed.has(g.channel_id as string),
  }));

  return NextResponse.json(channels);
}
