"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { RejectedUrl } from "@/lib/source";
import { VOCABULARY_OPTIONS, isVocabularyName } from "@/lib/vocabulary";

// Last-used processing choices are remembered across submissions. Both default
// off — transcription is the floor; summarizing and formatting are opt-in.
const SUMMARIZE_KEY = "tubereader:want_summary";
const FORMAT_KEY = "tubereader:want_format";
// Transcription vocabulary, remembered the same way. "" means none.
const VOCABULARY_KEY = "tubereader:vocabulary";

export function VideoSubmit({ onSubmitted }: { onSubmitted?: () => void }) {
  const [urls, setUrls] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<RejectedUrl[]>([]);
  const [summarize, setSummarize] = useState(false);
  const [format, setFormat] = useState(false);
  const [vocabulary, setVocabulary] = useState("");

  // Restore the remembered choices after mount (keeps SSR markup stable).
  useEffect(() => {
    try {
      setSummarize(localStorage.getItem(SUMMARIZE_KEY) === "1");
      setFormat(localStorage.getItem(FORMAT_KEY) === "1");
      const saved = localStorage.getItem(VOCABULARY_KEY);
      setVocabulary(isVocabularyName(saved) ? saved : "");
    } catch {
      // localStorage unavailable (private mode, etc.) — defaults are fine.
    }
  }, []);

  function persist(key: string, value: boolean) {
    try {
      localStorage.setItem(key, value ? "1" : "0");
    } catch {
      // ignore
    }
  }

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
        body: JSON.stringify({
          urls: lines,
          summarize,
          format,
          vocabulary: vocabulary || null,
        }),
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
      {/* Optional Claude passes. Both are stored per-video and can also be run
          later from a video's page ("Format for reading"). */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm select-none">
          <input
            type="checkbox"
            checked={summarize}
            onChange={(e) => {
              setSummarize(e.target.checked);
              persist(SUMMARIZE_KEY, e.target.checked);
            }}
            className="size-4 accent-primary"
          />
          Summarize
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm select-none">
          <input
            type="checkbox"
            checked={format}
            onChange={(e) => {
              setFormat(e.target.checked);
              persist(FORMAT_KEY, e.target.checked);
            }}
            className="size-4 accent-primary"
          />
          Format for reading
        </label>
        {/* Domain terms for the transcription model — names and phrases it
            would otherwise mishear. Applies to the transcript, not to Claude. */}
        <label className="flex items-center gap-2 text-sm select-none">
          Vocabulary
          <select
            value={vocabulary}
            onChange={(e) => {
              setVocabulary(e.target.value);
              try {
                localStorage.setItem(VOCABULARY_KEY, e.target.value);
              } catch {
                // ignore
              }
            }}
            // 16px on mobile stops iOS Safari zooming the viewport on focus.
            className="h-8 rounded-md border border-border bg-background px-2 text-base md:h-7 md:text-sm"
          >
            <option value="">None</option>
            {VOCABULARY_OPTIONS.map((v) => (
              <option key={v.name} value={v.name}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
      </div>
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
