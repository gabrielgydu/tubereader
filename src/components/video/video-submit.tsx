"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function VideoSubmit({ onSubmitted }: { onSubmitted?: () => void }) {
  const [urls, setUrls] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setUrls("");
      onSubmitted?.();
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
        placeholder="Paste YouTube or Instagram reel URLs (one per line, or comma-separated)..."
        rows={3}
        className="resize-none font-mono text-sm"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={submitting || !urls.trim()} size="sm">
        {submitting ? "Submitting..." : "Process Videos"}
      </Button>
    </form>
  );
}
