import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "fs";
import path from "path";
import { config } from "../config";
import type { Utterance, Video } from "../types";

/**
 * Mirror of a finished video as a standalone markdown file. The DB stays the
 * source of truth; these files exist so a transcript can be read, grepped and
 * handed to other tools without going through this app.
 */

// `status` is narrowed to VideoStatus on Video but comes back as a plain
// string from drizzle, and nothing here reads it.
export type VideoRow = Omit<Video, "status">;

/** Valid YAML double-quoted scalar — JSON string escaping is a subset of it. */
function q(value: string): string {
  return JSON.stringify(value);
}

function slugify(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/** yt-dlp gives YYYYMMDD; fall back to the day the video was added. */
function datePart(video: VideoRow): string {
  if (video.upload_date && /^\d{8}$/.test(video.upload_date)) {
    return video.upload_date;
  }
  return video.created_at.slice(0, 10).replace(/-/g, "") || "00000000";
}

function isoDate(video: VideoRow): string | null {
  const d = video.upload_date;
  if (!d) return null;
  if (/^\d{8}$/.test(d)) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  return d;
}

function hhmmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/**
 * The filename a video's markdown mirror gets. Deterministic, so re-exporting
 * overwrites in place; carries the platform id so two videos with the same
 * title on the same day can't collide.
 */
export function markdownFilename(video: VideoRow): string {
  let title = video.title ? slugify(video.title) : "";
  // Instagram ids are already slug-shaped and often repeat the caption.
  if (title && slugify(video.youtube_id).includes(title)) title = "";
  return [datePart(video), title, video.youtube_id].filter(Boolean).join("-") + ".md";
}

/**
 * Push model-written headings one level down so they nest under the section
 * they belong to instead of becoming siblings of it.
 */
function demoteHeadings(markdown: string): string {
  return markdown.replace(/^(#{1,5}) /gm, "#$1 ");
}

/** Break an unpunctuated wall of transcript into ~4-sentence paragraphs. */
function paragraphize(text: string): string {
  const sentences = text.trim().split(/(?<=[.!?…])\s+/);
  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += 4) {
    paragraphs.push(sentences.slice(i, i + 4).join(" "));
  }
  return paragraphs.join("\n\n");
}

/**
 * Best available rendering of the transcript: the formatted reading view if
 * one has been generated, else speaker-labeled dialogue for multi-speaker
 * videos, else the raw text broken into paragraphs.
 */
function transcriptBody(video: VideoRow): string {
  if (video.formatted_transcript) {
    return demoteHeadings(video.formatted_transcript.trim());
  }

  if (video.utterances) {
    try {
      const utterances: Utterance[] = JSON.parse(video.utterances);
      const speakers = new Set(utterances.map((u) => u.speaker));
      if (speakers.size > 1) {
        return utterances
          .map((u) => `**Speaker ${u.speaker}** (${hhmmss(u.start)}): ${u.text}`)
          .join("\n\n");
      }
    } catch {
      // fall through to the raw transcript
    }
  }

  return paragraphize(video.transcript || "");
}

export function renderVideoMarkdown(video: VideoRow): string {
  const url =
    video.source_url ||
    (video.platform === "youtube"
      ? `https://www.youtube.com/watch?v=${video.youtube_id}`
      : "");

  const frontmatter: string[] = ["---"];
  if (video.title) frontmatter.push(`title: ${q(video.title)}`);
  if (video.channel) frontmatter.push(`channel: ${q(video.channel)}`);
  if (video.channel_url) frontmatter.push(`channel_url: ${video.channel_url}`);
  if (url) frontmatter.push(`url: ${url}`);
  frontmatter.push(`youtube_id: ${q(video.youtube_id)}`);
  frontmatter.push(`platform: ${video.platform}`);
  const date = isoDate(video);
  if (date) frontmatter.push(`upload_date: ${date}`);
  if (video.duration) frontmatter.push(`duration: ${video.duration}`);
  if (video.category) frontmatter.push(`category: ${video.category}`);
  frontmatter.push(`source: tubereader`);
  frontmatter.push("---");

  const parts: string[] = [frontmatter.join("\n")];

  parts.push(`# ${video.title || video.youtube_id}`);

  const meta = [
    video.channel,
    video.duration ? hhmmss(video.duration) : null,
    url ? `[watch](${url})` : null,
  ].filter(Boolean);
  if (meta.length) parts.push(meta.join(" · "));

  if (video.verdict) parts.push(`> ${video.verdict}`);

  if (video.summary) {
    parts.push(`## Summary\n\n${demoteHeadings(video.summary.trim())}`);
  }

  if (video.key_takeaways) {
    try {
      const takeaways: string[] = JSON.parse(video.key_takeaways);
      if (takeaways.length) {
        parts.push(
          `## Key takeaways\n\n${takeaways.map((t) => `- ${t}`).join("\n\n")}`
        );
      }
    } catch {
      // no takeaways section
    }
  }

  parts.push(`## Transcript\n\n${transcriptBody(video)}`);

  return parts.join("\n\n") + "\n";
}

/**
 * Write (or rewrite) a video's markdown mirror. Returns the path written, or
 * null when there is nothing to write yet.
 */
export function writeVideoMarkdown(video: VideoRow): string | null {
  if (!video.transcript && !video.formatted_transcript) return null;

  const dir = config.markdownDir;
  mkdirSync(dir, { recursive: true });

  const filename = markdownFilename(video);
  const target = path.join(dir, filename);
  writeFileSync(target, renderVideoMarkdown(video), "utf-8");

  // A retitled video hashes to a new filename; drop the file the previous
  // title produced so the directory holds one file per video.
  const suffix = `-${video.youtube_id}.md`;
  for (const entry of readdirSync(dir)) {
    if (entry !== filename && entry.endsWith(suffix)) {
      try {
        unlinkSync(path.join(dir, entry));
      } catch {
        // leave it; a stale duplicate is not worth failing an export over
      }
    }
  }

  return target;
}
