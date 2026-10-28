import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const videos = sqliteTable("videos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Platform-native id: YouTube video id, or Instagram shortcode.
  // Column name is `youtube_id` for backward compatibility with existing data.
  youtube_id: text("youtube_id").notNull().unique(),
  platform: text("platform").notNull().default("youtube"),
  // Canonical webpage URL fetched by the pipeline (yt-dlp).
  source_url: text("source_url"),
  title: text("title"),
  channel: text("channel"),
  channel_id: text("channel_id"),
  channel_url: text("channel_url"),
  duration: integer("duration"),
  upload_date: text("upload_date"),
  thumbnail: text("thumbnail"),
  description: text("description"),
  chapters: text("chapters"),
  categories: text("categories"),
  tags: text("tags"),
  view_count: integer("view_count"),
  like_count: integer("like_count"),
  status: text("status").notNull().default("pending"),
  error_message: text("error_message"),
  // Per-submission processing choices. Transcription always runs; these gate
  // the two optional (and expensive) Claude stages. Persisted on the row so a
  // server restart mid-pipeline honors the original choice.
  want_summary: integer("want_summary", { mode: "boolean" })
    .notNull()
    .default(false),
  want_format: integer("want_format", { mode: "boolean" })
    .notNull()
    .default(false),
  // Transcription vocabulary (a key of VOCABULARIES in lib/vocabulary), or
  // null for none. Chosen per submission, like the two flags above.
  vocabulary: text("vocabulary"),
  transcript: text("transcript"),
  utterances: text("utterances"),
  // Reading view: transcript reorganized into markdown paragraphs + headings.
  formatted_transcript: text("formatted_transcript"),
  verdict: text("verdict"),
  summary: text("summary"),
  category: text("category"),
  key_takeaways: text("key_takeaways"),
  timestamps: text("timestamps"),
  created_at: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  processed_at: text("processed_at"),
  read_at: text("read_at"),
});

export const channels = sqliteTable("channels", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  channel_id: text("channel_id").notNull().unique(),
  platform: text("platform").notNull().default("youtube"),
  name: text("name").notNull(),
  url: text("url").notNull(),
  thumbnail: text("thumbnail"),
  last_checked: text("last_checked"),
  created_at: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});
