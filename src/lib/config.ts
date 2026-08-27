import { readFileSync } from "fs";
import path from "path";
import os from "os";

function loadAssemblyAIKey(): string {
  const configPath = path.join(
    os.homedir(),
    ".config",
    "audiorecorder",
    "config"
  );
  try {
    const content = readFileSync(configPath, "utf-8");
    const match = content.match(/^assemblyai_api_key=(.+)$/m);
    if (match) return match[1].trim();
  } catch {
    // fall through
  }
  if (process.env.ASSEMBLYAI_API_KEY) return process.env.ASSEMBLYAI_API_KEY;
  throw new Error(
    "AssemblyAI API key not found in ~/.config/audiorecorder/config or ASSEMBLYAI_API_KEY env"
  );
}

let cachedKey: string | null = null;

export const config = {
  dbPath:
    process.env.TUBEREADER_DB_PATH ||
    path.join(process.cwd(), "data", "tubereader.db"),
  audioDir:
    process.env.TUBEREADER_AUDIO_DIR ||
    path.join(process.cwd(), "data", "audio"),
  // Where finished videos are mirrored as standalone markdown files, so they
  // can be read and referenced from outside this app.
  markdownDir:
    process.env.TUBEREADER_MD_DIR ||
    path.join(os.homedir(), "recordings", "tubereader"),
  // Resolved on first use, not at import time: every module that touches the
  // DB or the UI imports this file, and none of them need a transcription key.
  get assemblyAIKey(): string {
    return (cachedKey ??= loadAssemblyAIKey());
  },
  maxConcurrency: 3,
  maxTranscriptLength: 100_000,
  // Browser to load cookies from for authenticated sources (Instagram).
  browserCookies: process.env.TUBEREADER_BROWSER_COOKIES || "brave",
  // How many recent items to pull when refreshing a channel/profile.
  channelRefreshLimit: Number(process.env.TUBEREADER_CHANNEL_LIMIT) || 20,
};

/**
 * yt-dlp / gallery-dl cookie args. Instagram has always required an
 * authenticated session; since ~mid-2026 YouTube blocks anonymous clients
 * ("Sign in to confirm you're not a bot"), so cookies are passed for all
 * platforms.
 */
export function cookieArgs(_platform: string): string[] {
  return ["--cookies-from-browser", config.browserCookies];
}
