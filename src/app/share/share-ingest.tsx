"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { isShortLink, parseSource, type RejectedUrl } from "@/lib/source";

/** Every http(s) URL in a blob of text, in order. */
function extractUrls(text: string): string[] {
  return text.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
}

/**
 * Share sheets are inconsistent about which field carries the link: Android
 * puts a bare URL in `url` but often folds it into `text` instead, and iOS
 * Shortcuts can be configured either way. Read all three and keep whatever
 * parses as a supported source — plus short links, which only the server can
 * resolve (parseSource is deliberately network-free).
 */
function collectSources(query: string): string[] {
  const params = new URLSearchParams(query);
  const candidates = ["url", "text", "title"].flatMap((key) => {
    const value = params.get(key);
    if (!value) return [];
    // Try the raw value first (a bare shared URL), then any links embedded in
    // prose like "Check this out https://youtu.be/…".
    return [value, ...extractUrls(value)];
  });

  const seen = new Set<string>();
  const sources: string[] = [];
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    const parsed = parseSource(trimmed);
    const source = parsed?.sourceUrl ?? (isShortLink(trimmed) ? trimmed : null);
    if (!source || seen.has(source)) continue;
    seen.add(source);
    sources.push(source);
  }
  return sources;
}

/** `ok` means the request came back — some of its URLs may still be rejected. */
type Outcome =
  | { ok: true; added: number; existing: number; rejected: RejectedUrl[] }
  | { ok: false; message: string };

export function ShareIngest() {
  const query = useSearchParams().toString();
  const sources = useMemo(() => collectSources(query), [query]);
  // Tagged with the share it belongs to, so a second share arriving while the
  // PWA is open doesn't briefly show the previous one's result.
  const [result, setResult] = useState<{ forQuery: string } & Outcome>();
  // Effects run twice under Strict Mode; POSTing once per distinct share
  // keeps a shared link from being re-queued.
  const submittedFor = useRef<string | null>(null);

  useEffect(() => {
    if (sources.length === 0 || submittedFor.current === query) return;
    submittedFor.current = query;

    (async () => {
      try {
        const res = await fetch("/api/videos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls: sources }),
        });
        const data: {
          accepted?: { new: boolean }[];
          rejected?: RejectedUrl[];
          error?: string;
        } = await res.json().catch(() => ({}));
        // An all-rejected batch answers 400; its per-URL reasons say more than
        // the status does, so only fall back to `error` without them.
        const rejected = data.rejected ?? [];
        if (!res.ok && rejected.length === 0) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        const accepted = data.accepted ?? [];
        setResult({
          forQuery: query,
          ok: true,
          added: accepted.filter((r) => r.new).length,
          existing: accepted.filter((r) => !r.new).length,
          rejected,
        });
      } catch (err) {
        setResult({
          forQuery: query,
          ok: false,
          message: err instanceof Error ? err.message : "Submit failed",
        });
      }
    })();
  }, [query, sources]);

  const outcome = result?.forQuery === query ? result : undefined;

  return (
    <div className="space-y-5">
      {sources.length > 0 && (
        <ul className="space-y-1">
          {sources.map((url) => (
            <li
              key={url}
              className="truncate rounded-md bg-card px-3 py-2 font-mono text-xs text-muted-foreground"
            >
              {url}
            </li>
          ))}
        </ul>
      )}

      {sources.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No YouTube, Instagram or SoundCloud link found in what was shared.
          Paste it on the feed instead.
        </p>
      ) : !outcome ? (
        <p className="text-sm text-muted-foreground">Queueing…</p>
      ) : outcome.ok ? (
        <div className="space-y-2">
          {(outcome.added > 0 || outcome.existing > 0) && (
            <p className="text-sm">
              {outcome.added > 0 && (
                <span className="text-green-400">
                  Queued {outcome.added}{" "}
                  {outcome.added === 1 ? "item" : "items"}.{" "}
                </span>
              )}
              {outcome.existing > 0 && (
                <span className="text-muted-foreground">
                  {outcome.existing} already in the library.
                </span>
              )}
            </p>
          )}
          {outcome.rejected.length > 0 && (
            <ul className="space-y-1 text-sm text-destructive">
              {outcome.rejected.map((r) => (
                <li key={r.url}>
                  <span className="break-all font-mono text-xs">{r.url}</span>{" "}
                  &mdash; {r.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-sm text-destructive">{outcome.message}</p>
      )}

      <Button
        render={<Link href="/" />}
        className="h-11 w-full md:h-8 md:w-auto md:px-3"
      >
        Open feed
      </Button>
    </div>
  );
}
