import { execFile } from "child_process";
import { promisify } from "util";
import { config } from "../config";

const execFileAsync = promisify(execFile);

export interface IgReel {
  shortcode: string;
  url: string;
  username: string | null;
  fullname: string | null;
  ownerId: string | null;
  profilePic: string | null;
}

function asStr(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Enumerate the most recent reels of an Instagram profile via gallery-dl,
 * authenticated with the configured browser cookies. yt-dlp's own
 * `instagram:user` extractor is currently broken, so gallery-dl handles the
 * profile listing; yt-dlp still handles the per-reel metadata/audio download.
 */
export async function enumerateReels(
  reelsUrl: string,
  limit: number
): Promise<IgReel[]> {
  const { stdout } = await execFileAsync(
    "gallery-dl",
    [
      "--cookies-from-browser",
      config.browserCookies,
      "--range",
      `1-${limit}`,
      "-j",
      reelsUrl,
    ],
    { maxBuffer: 64 * 1024 * 1024, timeout: 120_000 }
  );

  let messages: unknown;
  try {
    messages = JSON.parse(stdout);
  } catch {
    throw new Error("gallery-dl returned unparseable output");
  }
  if (!Array.isArray(messages)) return [];

  const seen = new Set<string>();
  const reels: IgReel[] = [];

  for (const msg of messages) {
    if (!Array.isArray(msg) || msg.length === 0) continue;
    const data = msg[msg.length - 1];
    if (!data || typeof data !== "object") continue;
    const d = data as Record<string, unknown>;

    const shortcode = asStr(d.post_shortcode) ?? asStr(d.shortcode);
    if (!shortcode || seen.has(shortcode)) continue;
    seen.add(shortcode);

    const user =
      d.user && typeof d.user === "object"
        ? (d.user as Record<string, unknown>)
        : {};

    reels.push({
      shortcode,
      url: asStr(d.post_url) ?? `https://www.instagram.com/reel/${shortcode}/`,
      username: asStr(d.username) ?? asStr(user.username),
      fullname: asStr(d.fullname) ?? asStr(user.full_name),
      ownerId: asStr(d.owner_id) ?? asStr(user.pk),
      profilePic: asStr(user.profile_pic_url),
    });

    if (reels.length >= limit) break;
  }

  // gallery-dl's --range is a soft cap; enforce the hard limit ourselves.
  return reels.slice(0, limit);
}
