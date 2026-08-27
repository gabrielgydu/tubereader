"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { RejectedUrl } from "@/lib/source";

export function VideoSubmit({ onSubmitted }: { onSubmitted?: () => void }) {
  const [urls, setUrls] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<RejectedUrl[]>([]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setRejected([]);
    const lines = urls
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (lines.length === 0) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: lines }),
      });
      const data: {
        accepted?: unknown[];
        rejected?: RejectedUrl[];
        error?: string;
      } = await res.json().catch(() => ({}));
      // An all-rejected batch answers 400, but the per-URL reasons are more
      // useful than the status, so only fall back to `error` without them.
      const bad = data.rejected ?? [];
      if (!res.ok && bad.length === 0) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setRejected(bad);
      // Leave the rejected URLs in the box so they can be fixed and resent.
      setUrls(bad.map((r) => r.url).join("\n"));
      if ((data.accepted?.length ?? 0) > 0) onSubmitted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Textarea
        value={urls}
        onChange={(e) => setUrls(e.target.value)}
        placeholder="Paste YouTube, Instagram, or SoundCloud URLs (one per line, or comma-separated)..."
        rows={3}
        // URLs, so none of iOS's typing assistance helps here.
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        inputMode="url"
        className="resize-none font-mono text-base md:text-sm"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {rejected.length > 0 && (
        <ul className="space-y-1 text-sm text-destructive">
          {rejected.map((r, i) => (
            <li key={`${i}-${r.url}`}>
              <span className="break-all font-mono text-xs">{r.url}</span>{" "}
              &mdash; {r.message}
            </li>
          ))}
        </ul>
      )}
      <Button
        type="submit"
        disabled={submitting || !urls.trim()}
        className="h-11 w-full md:h-7 md:w-auto md:px-2.5 md:text-[0.8rem]"
      >
        {submitting ? "Submitting..." : "Process Videos"}
      </Button>
    </form>
  );
}
