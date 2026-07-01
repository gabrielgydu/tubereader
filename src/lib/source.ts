// Platform-agnostic source parsing and external-URL helpers.
// Pure string logic — safe to import from both server and client components.

export type Platform = "youtube" | "instagram";

export interface ParsedSource {
  platform: Platform;
  /** Platform-native id: YouTube 11-char id, or Instagram shortcode. */
  sourceId: string;
  /** Canonical webpage URL the pipeline (yt-dlp) should fetch. */
  sourceUrl: string;
}

const YT_PATTERNS: RegExp[] = [
  /youtu\.be\/([a-zA-Z0-9_-]{11})/i,
  /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/i,
  /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/i,
  /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/i,
];

// Single Instagram item: /reel/<code>/, /reels/<code>/, /p/<code>/, /tv/<code>/.
// An optional <username>/ segment precedes the keyword when the URL is copied
// from a profile grid (e.g. instagram.com/natgeo/reel/<code>/).
const IG_ITEM = /instagram\.com\/(?:[A-Za-z0-9._]+\/)?(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i;

// Usernames that are actually route keywords, not profiles.
const IG_RESERVED = new Set([
  "reel",
  "reels",
  "p",
  "tv",
  "stories",
  "explore",
  "accounts",
  "direct",
  "about",
]);

/** Parse a single-video URL (YouTube or Instagram) into its canonical source. */
export function parseSource(url: string): ParsedSource | null {
  for (const p of YT_PATTERNS) {
    const m = url.match(p);
    if (m) {
      return {
        platform: "youtube",
        sourceId: m[1],
        sourceUrl: `https://www.youtube.com/watch?v=${m[1]}`,
      };
    }
  }

  const ig = url.match(IG_ITEM);
  if (ig) {
    const matched = ig[1].toLowerCase();
    const kind = matched === "reels" ? "reel" : matched;
    return {
      platform: "instagram",
      sourceId: ig[2],
      sourceUrl: `https://www.instagram.com/${kind}/${ig[2]}/`,
    };
  }

  return null;
}

/** Parse an Instagram profile URL into a username + canonical reels listing URL. */
export function parseInstagramProfile(
  url: string
): { username: string; profileUrl: string; reelsUrl: string } | null {
  if (!/instagram\.com/i.test(url)) return null;
  const clean = url.split(/[?#]/)[0];
  const m = clean.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  if (!m) return null;
  // Instagram usernames are case-insensitive; canonicalize to lowercase so the
  // channel id matches what yt-dlp/gallery-dl report for the reels.
  const username = m[1].toLowerCase();
  if (IG_RESERVED.has(username)) return null;
  return {
    username,
    profileUrl: `https://www.instagram.com/${username}/`,
    reelsUrl: `https://www.instagram.com/${username}/reels/`,
  };
}

/** Stable channel id for a platform. Instagram profiles are keyed by username. */
export function instagramChannelId(username: string): string {
  return `ig:${username.toLowerCase()}`;
}

type LinkableVideo = {
  platform: string;
  youtube_id: string;
  source_url: string | null;
};

/** Best external "open the original" URL, with an optional timestamp deep-link. */
export function externalUrl(video: LinkableVideo, seconds?: number): string {
  if (video.platform === "youtube") {
    const base = `https://www.youtube.com/watch?v=${video.youtube_id}`;
    return seconds != null ? `${base}&t=${Math.floor(seconds)}` : base;
  }
  // Instagram (and any other platform) has no timestamp deep-linking.
  return video.source_url || `https://www.instagram.com/reel/${video.youtube_id}/`;
}

/** Embeddable iframe URL for the platform, or null if none is available. */
export function embedUrl(video: {
  platform: string;
  youtube_id: string;
}): string | null {
  if (video.platform === "youtube") {
    return `https://www.youtube.com/embed/${video.youtube_id}`;
  }
  if (video.platform === "instagram") {
    return `https://www.instagram.com/reel/${video.youtube_id}/embed`;
  }
  return null;
}

/** Whether timestamp anchors can deep-link into the source (YouTube only). */
export function supportsTimestampLinks(platform: string): boolean {
  return platform === "youtube";
}
