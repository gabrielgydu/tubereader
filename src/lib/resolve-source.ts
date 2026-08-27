// Turns a pasted or shared URL into a canonical source, reaching the network
// only for the known share shorteners that carry no id of their own (see
// isShortLink). Server-only by design: ./source stays pure string logic so
// client components can keep importing it, and no client bundle should be
// following redirects on the user's behalf.

import {
  httpHostname,
  isShortLink,
  parseSource,
  type ParsedSource,
  type RejectionReason,
} from "./source";

/** Total network budget for one URL, shared across every redirect hop. */
const RESOLVE_TIMEOUT_MS = 10_000;

/** on.soundcloud.com needs one hop; the cap is only there to end a loop. */
const MAX_HOPS = 5;

// Statuses that mean "this host won't answer HEAD", not "there is no redirect".
const HEAD_UNSUPPORTED = new Set([400, 403, 405, 501]);

// Hosts the pipeline does handle. A URL on one of these that still doesn't
// parse is a playlist, profile or station page — worth saying so rather than
// claiming the whole site is unsupported.
const PLATFORM_HOSTS = new Set([
  "youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "instagram.com",
  "soundcloud.com",
  "m.soundcloud.com",
]);

/** Why a URL that isn't a short link can't be used. */
function unsupportedMessage(url: string): string {
  const host = httpHostname(url);
  return host !== null && PLATFORM_HOSTS.has(host)
    ? "not a single video or track link (a playlist, profile or channel?)"
    : "not a YouTube, Instagram or SoundCloud link";
}

export type ResolvedSource =
  | { ok: true; source: ParsedSource }
  | { ok: false; reason: RejectionReason; message: string };

/**
 * Whether a redirect target may be requested. No share link legitimately points
 * at a bare IP or a local name, and refusing both keeps a compromised (or
 * merely open) shortener from aiming this server at its own network.
 */
function isFollowable(target: URL): boolean {
  if (target.protocol !== "http:" && target.protocol !== "https:") return false;
  const host = target.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return false;
  }
  // IPv6 literals are bracketed; the numeric test also catches the decimal and
  // octal spellings of an IPv4 address (e.g. 2130706433 for 127.0.0.1).
  return !host.startsWith("[") && !/^\d+(\.\d+)*$/.test(host);
}

/**
 * The `Location` of a single hop, or null if the URL is a final page. HEAD
 * first — the shorteners answer it with an empty body — falling back to GET for
 * hosts that reject the method outright.
 */
async function redirectTarget(
  url: string,
  signal: AbortSignal
): Promise<string | null> {
  for (const method of ["HEAD", "GET"] as const) {
    const res = await fetch(url, { method, redirect: "manual", signal });
    // The body is never read; cancelling it frees the connection right away.
    await res.body?.cancel();
    const location = res.headers.get("location");
    if (location) return location;
    if (method === "HEAD" && HEAD_UNSUPPORTED.has(res.status)) continue;
    return null;
  }
  return null;
}

/** Follow a short link until it lands on something parseSource() accepts. */
async function followToSource(start: string): Promise<ParsedSource> {
  const signal = AbortSignal.timeout(RESOLVE_TIMEOUT_MS);
  let current = start;

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const location = await redirectTarget(current, signal);
    if (!location) {
      throw new Error(
        hop === 0
          ? "short link did not redirect anywhere"
          : "short link did not lead to a supported page"
      );
    }

    const target = new URL(location, current);
    if (!isFollowable(target)) {
      // A schemeless-host target (file:, data:) has no hostname to name.
      throw new Error(
        `refusing to follow redirect to ${target.hostname || target.protocol}`
      );
    }
    current = target.toString();

    const source = parseSource(current);
    if (source) return source;
  }

  throw new Error("short link redirected too many times");
}

/**
 * Resolve one submitted URL. A URL that already parses costs no network
 * request; a known shortener costs at most RESOLVE_TIMEOUT_MS. Never throws —
 * every failure comes back as a reason the caller can report.
 */
export async function resolveSource(input: string): Promise<ResolvedSource> {
  const url = input.trim();

  const direct = parseSource(url);
  if (direct) return { ok: true, source: direct };

  if (!isShortLink(url)) {
    return { ok: false, reason: "unsupported", message: unsupportedMessage(url) };
  }

  try {
    return { ok: true, source: await followToSource(url) };
  } catch (err) {
    const timedOut =
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError");
    return {
      ok: false,
      reason: "unresolved",
      message: timedOut
        ? "timed out resolving short link"
        : err instanceof Error
          ? err.message
          : "could not resolve short link",
    };
  }
}
