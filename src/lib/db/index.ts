import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "fs";
import path from "path";
import { config } from "../config";
import * as schema from "./schema";

function createDb() {
  mkdirSync(path.dirname(config.dbPath), { recursive: true });
  const sqlite = new Database(config.dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      youtube_id TEXT NOT NULL UNIQUE,
      platform TEXT NOT NULL DEFAULT 'youtube',
      source_url TEXT,
      title TEXT,
      channel TEXT,
      channel_id TEXT,
      channel_url TEXT,
      duration INTEGER,
      upload_date TEXT,
      thumbnail TEXT,
      description TEXT,
      chapters TEXT,
      categories TEXT,
      tags TEXT,
      view_count INTEGER,
      like_count INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      transcript TEXT,
      utterances TEXT,
      verdict TEXT,
      summary TEXT,
      category TEXT,
      key_takeaways TEXT,
      timestamps TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      processed_at TEXT,
      read_at TEXT
    );

    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id TEXT NOT NULL UNIQUE,
      platform TEXT NOT NULL DEFAULT 'youtube',
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      thumbnail TEXT,
      last_checked TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS videos_fts USING fts5(
      youtube_id,
      title,
      channel,
      transcript,
      summary,
      key_takeaways,
      content='videos',
      content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS videos_ai AFTER INSERT ON videos BEGIN
      INSERT INTO videos_fts(rowid, youtube_id, title, channel, transcript, summary, key_takeaways)
      VALUES (new.id, new.youtube_id, new.title, new.channel, new.transcript, new.summary, new.key_takeaways);
    END;

    CREATE TRIGGER IF NOT EXISTS videos_ad AFTER DELETE ON videos BEGIN
      INSERT INTO videos_fts(videos_fts, rowid, youtube_id, title, channel, transcript, summary, key_takeaways)
      VALUES ('delete', old.id, old.youtube_id, old.title, old.channel, old.transcript, old.summary, old.key_takeaways);
    END;

    CREATE TRIGGER IF NOT EXISTS videos_au AFTER UPDATE ON videos BEGIN
      INSERT INTO videos_fts(videos_fts, rowid, youtube_id, title, channel, transcript, summary, key_takeaways)
      VALUES ('delete', old.id, old.youtube_id, old.title, old.channel, old.transcript, old.summary, old.key_takeaways);
      INSERT INTO videos_fts(rowid, youtube_id, title, channel, transcript, summary, key_takeaways)
      VALUES (new.id, new.youtube_id, new.title, new.channel, new.transcript, new.summary, new.key_takeaways);
    END;
  `);

  // Additive migrations for databases created before multi-platform support.
  const videoCols = sqlite.pragma("table_info(videos)") as { name: string }[];
  if (!videoCols.some((c) => c.name === "read_at")) {
    sqlite.exec("ALTER TABLE videos ADD COLUMN read_at TEXT");
  }
  if (!videoCols.some((c) => c.name === "platform")) {
    sqlite.exec(
      "ALTER TABLE videos ADD COLUMN platform TEXT NOT NULL DEFAULT 'youtube'"
    );
  }
  if (!videoCols.some((c) => c.name === "source_url")) {
    sqlite.exec("ALTER TABLE videos ADD COLUMN source_url TEXT");
  }
  const channelCols = sqlite.pragma("table_info(channels)") as { name: string }[];
  if (!channelCols.some((c) => c.name === "platform")) {
    sqlite.exec(
      "ALTER TABLE channels ADD COLUMN platform TEXT NOT NULL DEFAULT 'youtube'"
    );
  }

  return drizzle(sqlite, { schema });
}

const globalForDb = globalThis as typeof globalThis & {
  __tubereader_db?: ReturnType<typeof createDb>;
};

export const db = globalForDb.__tubereader_db ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__tubereader_db = db;
}

export { schema };
