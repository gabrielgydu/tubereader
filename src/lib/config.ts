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

export const config = {
  dbPath:
    process.env.TUBEREADER_DB_PATH ||
    path.join(process.cwd(), "data", "tubereader.db"),
  audioDir:
    process.env.TUBEREADER_AUDIO_DIR ||
    path.join(process.cwd(), "data", "audio"),
  assemblyAIKey: loadAssemblyAIKey(),
  maxConcurrency: 3,
  maxTranscriptLength: 100_000,
  // Browser to load cookies from for authenticated sources (Instagram).
  browserCookies: process.env.TUBEREADER_BROWSER_COOKIES || "brave",
  // How many recent items to pull when refreshing a channel/profile.
  channelRefreshLimit: Number(process.env.TUBEREADER_CHANNEL_LIMIT) || 20,
};

/**
 * yt-dlp / gallery-dl cookie args. Instagram enumeration and downloads require
 * an authenticated session; YouTube is left unauthenticated (unchanged behavior).
 */
export function cookieArgs(platform: string): string[] {
  return platform === "instagram"
    ? ["--cookies-from-browser", config.browserCookies]
    : [];
}
