// Platform-agnostic source parsing and external-URL helpers.
// Pure string logic — safe to import from both server and client components.

export type Platform = "youtube" | "instagram" | "soundcloud";

export interface ParsedSource {
  platform: Platform;
  /**
   * Platform-native id: YouTube 11-char id, Instagram shortcode, or
   * SoundCloud "<user>__<track-slug>" (slash-free — the id is used in
   * audio filenames).
   */
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

// SoundCloud track: soundcloud.com/<user>/<track-slug>, optionally followed
// by a secret token segment (/s-XXXX) for private tracks. Matched against the
// URL with query/fragment stripped, so playlist context (?in=...) and share
// tracking params never leak into the canonical URL.
const SC_TRACK =
  /soundcloud\.com\/([a-z0-9_-]+)\/([a-z0-9_-]+)(\/s-[A-Za-z0-9]+)?/i;

// First path segments that are site routes, not user profiles.
const SC_RESERVED = new Set([
  "discover",
  "search",
  "stream",
  "upload",
  "you",
  "charts",
  "people",
  "pages",
  "tags",
  "stations",
  "messages",
  "notifications",
  "settings",
  "popular",
  "mobile",
  "jobs",
  "imprint",
  "terms-of-use",
]);

// Second path segments that are profile sub-pages, not tracks.
const SC_NON_TRACK = new Set([
  "sets",
  "albums",
  "tracks",
  "reposts",
  "likes",
  "followers",
  "following",
  "comments",
  "popular-tracks",
  "spotlight",
]);

// Share-sheet shorteners whose links carry no platform id at all — they only
// 30x to a URL parseSource understands. Following them needs the network, so
// the resolution itself lives in the server-only resolver (./resolve-source);
// this list is the pure "is a request worth making?" test both sides share.
// Verified by probing each host — do not add a host without checking it.
const SHORT_LINK_HOSTS = new Set([
  // SoundCloud's own share/copy-link domain: 302 → soundcloud.com/<user>/<slug>.
  "on.soundcloud.com",
  // Instagram's legacy short domain: 301 → www.instagram.com/<same path>.
  "instagr.am",
]);

/** Why a submitted URL could not be turned into a source. */
export type RejectionReason =
  /** Not a supported platform link (or a link to something that isn't a track). */
  | "unsupported"
  /** A known shortener that could not be followed to a usable URL. */
  | "unresolved";

export interface RejectedUrl {
  url: string;
  reason: RejectionReason;
  message: string;
}

/** Hostname without a `www.` prefix, or null if `url` isn't an http(s) URL. */
export function httpHostname(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return parsed.hostname.toLowerCase().replace(/^www\./, "");
}

/**
 * Whether the URL is a known share shortener, i.e. whether it is worth a
 * network round-trip to find out what it points at. Pure — see resolveSource().
 */
export function isShortLink(url: string): boolean {
  const host = httpHostname(url);
  return host !== null && SHORT_LINK_HOSTS.has(host);
}

/** Parse a single-item URL (YouTube, Instagram, SoundCloud) into its canonical source. */
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

  const sc = url.split(/[?#]/)[0].match(SC_TRACK);
  if (sc) {
    // Permalinks are canonically lowercase; the secret token is case-sensitive.
    const user = sc[1].toLowerCase();
    const slug = sc[2].toLowerCase();
    if (!SC_RESERVED.has(user) && !SC_NON_TRACK.has(slug)) {
      return {
        platform: "soundcloud",
        sourceId: `${user}__${slug}`,
        sourceUrl: `https://soundcloud.com/${user}/${slug}${sc[3] ?? ""}`,
      };
    }
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

/** SoundCloud #t= fragment: m:ss, or h:mm:ss for hour-plus tracks. */
function scTimestamp(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** Best external "open the original" URL, with an optional timestamp deep-link. */
export function externalUrl(video: LinkableVideo, seconds?: number): string {
  if (video.platform === "youtube") {
    const base = `https://www.youtube.com/watch?v=${video.youtube_id}`;
    return seconds != null ? `${base}&t=${Math.floor(seconds)}` : base;
  }
  if (video.platform === "soundcloud") {
    const base =
      video.source_url ||
      `https://soundcloud.com/${video.youtube_id.replace("__", "/")}`;
    return seconds != null ? `${base}#t=${scTimestamp(seconds)}` : base;
  }
  // Instagram (and any other platform) has no timestamp deep-linking.
  return video.source_url || `https://www.instagram.com/reel/${video.youtube_id}/`;
}

/** Embeddable iframe URL for the platform, or null if none is available. */
export function embedUrl(video: {
  platform: string;
  youtube_id: string;
  source_url?: string | null;
}): string | null {
  if (video.platform === "youtube") {
    return `https://www.youtube.com/embed/${video.youtube_id}`;
  }
  if (video.platform === "instagram") {
    return `https://www.instagram.com/reel/${video.youtube_id}/embed`;
  }
  if (video.platform === "soundcloud" && video.source_url) {
    // The widget resolves the track page URL itself (secret token included).
    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(video.source_url)}`;
  }
  return null;
}

/** Whether timestamp anchors can deep-link into the source. */
export function supportsTimestampLinks(platform: string): boolean {
  return platform === "youtube" || platform === "soundcloud";
}
