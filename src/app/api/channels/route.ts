import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { execFile } from "child_process";
import { promisify } from "util";
import { parseInstagramProfile, instagramChannelId } from "@/lib/source";
import { enumerateReels } from "@/lib/pipeline/instagram";

const execFileAsync = promisify(execFile);

export async function GET() {
  const channels = db
    .select()
    .from(schema.channels)
    .orderBy(desc(schema.channels.created_at))
    .all();
  return NextResponse.json(channels);
}

function existingChannel(channelId: string) {
  return db
    .select()
    .from(schema.channels)
    .where(eq(schema.channels.channel_id, channelId))
    .get();
}

type Channel = typeof schema.channels.$inferSelect;
type SubscribeResult = { channel: Channel; isNew: boolean } | null;

async function subscribeInstagram(
  username: string,
  reelsUrl: string
): Promise<SubscribeResult> {
  const channelId = instagramChannelId(username);

  const existing = existingChannel(channelId);
  if (existing) return { channel: existing, isNew: false };

  // First reel doubles as profile identity (name + avatar).
  const reels = await enumerateReels(reelsUrl, 1);
  const first = reels[0];

  const channel = db
    .insert(schema.channels)
    .values({
      channel_id: channelId,
      platform: "instagram",
      name: first?.fullname || username,
      url: reelsUrl,
      thumbnail: first?.profilePic || null,
      created_at: new Date().toISOString(),
    })
    .returning()
    .get();
  return { channel, isNew: true };
}

async function subscribeYouTube(url: string): Promise<SubscribeResult> {
  const { stdout } = await execFileAsync(
    "yt-dlp",
    [
      "--print", "channel",
      "--print", "channel_id",
      "--print", "channel_url",
      "--print", "thumbnail",
      "--playlist-items", "1",
      "--",
      url,
    ],
    { timeout: 30_000 }
  );

  const lines = stdout.trim().split("\n");
  const channelName = lines[0] || "Unknown";
  const channelId = lines[1];
  const channelUrl = lines[2] || url;
  const thumbnail = lines[3] || null;

  if (!channelId) return null;

  const existing = existingChannel(channelId);
  if (existing) return { channel: existing, isNew: false };

  const channel = db
    .insert(schema.channels)
    .values({
      channel_id: channelId,
      platform: "youtube",
      name: channelName,
      url: channelUrl,
      thumbnail,
      created_at: new Date().toISOString(),
    })
    .returning()
    .get();
  return { channel, isNew: true };
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const url: string = body.url;

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      { error: "url must be an http(s) URL" },
      { status: 400 }
    );
  }

  try {
    const igProfile = parseInstagramProfile(url);

    const result = igProfile
      ? await subscribeInstagram(igProfile.username, igProfile.reelsUrl)
      : await subscribeYouTube(url);

    if (!result) {
      return NextResponse.json(
        { error: "Could not resolve channel" },
        { status: 400 }
      );
    }

    return NextResponse.json(result.channel, {
      status: result.isNew ? 201 : 200,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to resolve channel" },
      { status: 400 }
    );
  }
}
