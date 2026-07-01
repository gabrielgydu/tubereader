import { spawn } from "child_process";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { cookieArgs } from "../config";
import { instagramChannelId } from "../source";

interface YtDlpMetadata {
  id: string;
  title: string;
  channel: string | null;
  channel_id: string | null;
  channel_url: string | null;
  uploader: string | null;
  duration: number;
  upload_date: string;
  thumbnail: string;
  description: string;
  chapters: Array<{ start_time: number; end_time: number; title: string }> | null;
  categories: string[] | null;
  tags: string[] | null;
  view_count: number | null;
  like_count: number | null;
}

function runYtDlp(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", args, { timeout: 60_000 });
    const chunks: Buffer[] = [];
    proc.stdout.on("data", (d) => chunks.push(d));
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("close", () => {
      const stdout = Buffer.concat(chunks).toString();
      if (stdout.trim()) resolve(stdout);
      else reject(new Error(`yt-dlp produced no output: ${stderr.slice(-300)}`));
    });
    proc.on("error", reject);
  });
}

/** Instagram titles from yt-dlp are generic ("Video by x"); use the caption instead. */
function instagramTitle(meta: YtDlpMetadata): string {
  const firstLine = (meta.description || "")
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (firstLine) return firstLine.slice(0, 120);
  return meta.title;
}

export async function extractMetadata(videoId: number): Promise<void> {
  const video = db
    .select()
    .from(schema.videos)
    .where(eq(schema.videos.id, videoId))
    .get();

  if (!video) throw new Error(`Video ${videoId} not found`);

  const url =
    video.source_url || `https://www.youtube.com/watch?v=${video.youtube_id}`;

  const stdout = await runYtDlp([
    "--dump-json",
    "--skip-download",
    "--no-playlist",
    ...cookieArgs(video.platform),
    "--",
    url,
  ]);

  const meta: YtDlpMetadata = JSON.parse(stdout);
  const isInstagram = video.platform === "instagram";

  // A subscription's channel_id (set at ingest) is authoritative — never
  // overwrite it, so channel-filtered videos stay linked to their channel.
  // Only derive one when absent (e.g. a single reel pasted directly). yt-dlp
  // returns no channel_id for Instagram, so key it by username.
  const derivedChannelId = isInstagram
    ? meta.channel
      ? instagramChannelId(meta.channel)
      : null
    : meta.channel_id;
  const channelId = video.channel_id ?? derivedChannelId;

  const channelName = isInstagram
    ? meta.uploader || meta.channel
    : meta.channel;

  const channelUrl = isInstagram
    ? meta.channel
      ? `https://www.instagram.com/${meta.channel}/`
      : video.channel_url
    : meta.channel_url;

  db.update(schema.videos)
    .set({
      title: isInstagram ? instagramTitle(meta) : meta.title,
      channel: channelName,
      channel_id: channelId,
      channel_url: channelUrl,
      duration: meta.duration,
      upload_date: meta.upload_date,
      thumbnail: meta.thumbnail,
      description: meta.description?.slice(0, 5000) || null,
      chapters: meta.chapters ? JSON.stringify(meta.chapters) : null,
      categories: meta.categories ? JSON.stringify(meta.categories) : null,
      tags: meta.tags ? JSON.stringify(meta.tags) : null,
      view_count: meta.view_count ?? null,
      like_count: meta.like_count ?? null,
      status: "metadata",
    })
    .where(eq(schema.videos.id, videoId))
    .run();
}
