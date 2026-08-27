"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";
import type { Video, Utterance, VideoTimestamp } from "@/lib/types";
import { formatDuration, formatDate, formatViews, secondsToTimestamp } from "@/lib/format";
import { externalUrl, embedUrl, supportsTimestampLinks } from "@/lib/source";
import Link from "next/link";

export default function VideoDetailPage() {
  const params = useParams();
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [transcriptView, setTranscriptView] = useState<"formatted" | "raw">(
    "formatted"
  );
  const [formatting, setFormatting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch(`/api/videos/${params.id}`)
      .then((r) => r.json())
      .then(setVideo)
      .finally(() => setLoading(false));
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [params.id]);

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!video) return <div className="p-6 text-destructive">Video not found</div>;

  const utterances: Utterance[] = video.utterances
    ? JSON.parse(video.utterances)
    : [];
  const takeaways: string[] = video.key_takeaways
    ? JSON.parse(video.key_takeaways)
    : [];
  const timestamps: VideoTimestamp[] = video.timestamps
    ? JSON.parse(video.timestamps)
    : [];

  async function handleFormat() {
    setFormatting(true);
    const res = await fetch(`/api/videos/${video!.id}/format`, {
      method: "POST",
    });
    if (!res.ok) {
      setFormatting(false);
      return;
    }
    // Poll until the formatted transcript lands.
    pollRef.current = setInterval(async () => {
      const v: Video = await fetch(`/api/videos/${params.id}`).then((r) =>
        r.json()
      );
      if (v.formatted_transcript) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setVideo(v);
        setTranscriptView("formatted");
        setFormatting(false);
      }
    }, 5000);
  }

  function handleExport() {
    const md = [
      `# ${video!.title}`,
      `**Channel:** ${video!.channel}`,
      `**Duration:** ${formatDuration(video!.duration)}`,
      `**Uploaded:** ${formatDate(video!.upload_date)}`,
      "",
      video!.verdict ? `> ${video!.verdict}` : "",
      "",
      "## Summary",
      video!.summary || "",
      "",
      takeaways.length > 0 ? "## Key Takeaways" : "",
      ...takeaways.map((t) => `- ${t}`),
      "",
      "## Transcript",
      video!.formatted_transcript || video!.transcript || "",
    ]
      .filter(Boolean)
      .join("\n");

    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${video!.youtube_id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:underline">
          Feed
        </Link>
        <span>/</span>
        <span className="truncate">{video.title || video.youtube_id}</span>
      </div>

      {/* Source embed. YouTube fills a 16:9 frame; the Instagram /embed endpoint
          renders a fixed-layout card, so give it a portrait box without cropping;
          the SoundCloud widget is a full-width 166px strip. */}
      {embedUrl(video) && (
        <div
          className={
            video.platform === "instagram"
              ? // Capped against the viewport too, so the fixed-layout card
                // doesn't push a phone screen taller than it can show.
                "mx-auto h-[min(640px,70svh)] w-full max-w-[400px] overflow-hidden rounded-lg bg-black"
              : video.platform === "soundcloud"
                ? "h-[166px] overflow-hidden rounded-lg"
                : "aspect-video overflow-hidden rounded-lg bg-black"
          }
        >
          <iframe
            src={embedUrl(video)!}
            className="w-full h-full"
            allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          />
        </div>
      )}

      {/* Meta */}
      <div className="space-y-2">
        <h1 className="text-lg font-bold sm:text-xl">
          {video.title || video.youtube_id}
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
          {video.channel && <span>{video.channel}</span>}
          {video.duration != null && <span>{formatDuration(video.duration)}</span>}
          {video.upload_date && <span>{formatDate(video.upload_date)}</span>}
          {video.view_count != null && <span>{formatViews(video.view_count)}</span>}
          {video.category && (
            <Badge variant="outline">{video.category}</Badge>
          )}
          <Badge variant="secondary">{video.status}</Badge>
          <a
            href={externalUrl(video)}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            {video.platform === "instagram"
              ? "Open on Instagram ↗"
              : video.platform === "soundcloud"
                ? "Listen on SoundCloud ↗"
                : "Watch on YouTube ↗"}
          </a>
        </div>
      </div>

      {/* Verdict */}
      {video.verdict && (
        <blockquote className="border-l-2 border-primary pl-4 italic text-muted-foreground">
          {video.verdict}
        </blockquote>
      )}

      {/* Key Takeaways */}
      {takeaways.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-2">Key Takeaways</h2>
          <ul className="space-y-1 text-sm">
            {takeaways.map((t, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-muted-foreground shrink-0">•</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Summary */}
      {video.summary && (
        <div>
          <h2 className="text-lg font-semibold mb-2">Summary</h2>
          <Markdown>{video.summary}</Markdown>
        </div>
      )}

      {/* Timestamps */}
      {timestamps.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-2">Timestamps</h2>
          <div className="space-y-1">
            {timestamps.map((ts, i) => {
              const inner = (
                <>
                  <span className="font-mono text-muted-foreground shrink-0">
                    {secondsToTimestamp(ts.time)}
                  </span>
                  <span className="font-medium">{ts.label}</span>
                  {ts.description && (
                    <span className="text-muted-foreground">{ts.description}</span>
                  )}
                </>
              );
              // Only YouTube supports seeking via ?t=; render IG as plain text.
              return supportsTimestampLinks(video.platform) ? (
                <a
                  key={i}
                  href={externalUrl(video, ts.time)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex gap-3 text-sm hover:bg-accent/50 rounded px-2 py-1"
                >
                  {inner}
                </a>
              ) : (
                <div key={i} className="flex gap-3 text-sm px-2 py-1">
                  {inner}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Transcript */}
      {(video.transcript || utterances.length > 0) && (
        <div>
          {/* Sticky on mobile so the view toggle and export stay reachable
              while reading a long transcript. */}
          <div className="sticky top-[calc(3rem+env(safe-area-inset-top))] z-30 -mx-4 mb-2 flex flex-wrap items-center justify-between gap-2 bg-background/90 px-4 py-2 backdrop-blur md:static md:mx-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
            <h2 className="text-lg font-semibold">Transcript</h2>
            <div className="flex items-center gap-2">
              {video.formatted_transcript ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 px-3 md:h-7 md:px-2.5 md:text-[0.8rem]"
                  onClick={() =>
                    setTranscriptView((v) =>
                      v === "formatted" ? "raw" : "formatted"
                    )
                  }
                >
                  {transcriptView === "formatted" ? "Show raw" : "Show formatted"}
                </Button>
              ) : (
                video.transcript && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 px-3 md:h-7 md:px-2.5 md:text-[0.8rem]"
                    disabled={formatting}
                    onClick={handleFormat}
                  >
                    {formatting ? "Formatting…" : "Format for reading"}
                  </Button>
                )
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-10 px-3 md:h-7 md:px-2.5 md:text-[0.8rem]"
                onClick={handleExport}
              >
                Export Markdown
              </Button>
              {/* The markdown mirror, opened in notas — a real link rather
                  than a Button, since that is what it is. The route refreshes
                  the file and redirects, so the URL stays server-side. */}
              {(video.formatted_transcript || video.transcript) && (
                <a
                  href={`/api/videos/${video.id}/notas`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "h-10 px-3 md:h-7 md:px-2.5 md:text-[0.8rem]"
                  )}
                >
                  Open in Notas ↗
                </a>
              )}
            </div>
          </div>
          {/* On a phone the transcript flows into the page — a scroll box
              inside a scrolling page is miserable to read with a thumb. The
              capped box comes back on desktop, where it keeps the sidebar and
              metadata in view. */}
          <div className="rounded-lg bg-card p-4 md:max-h-[600px] md:overflow-y-auto">
            {video.formatted_transcript && transcriptView === "formatted" ? (
              <Markdown>{video.formatted_transcript}</Markdown>
            ) : utterances.length > 0 ? (
              <div className="space-y-3">
                {utterances.map((u, i) => (
                  <div key={i} className="text-sm">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-xs text-muted-foreground">
                        {secondsToTimestamp(u.start)}
                      </span>
                      <span className="text-xs font-semibold text-primary">
                        {u.speaker}
                      </span>
                    </div>
                    <p className="text-muted-foreground">{u.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              // break-words: an unbroken URL in a raw transcript would
              // otherwise widen the page past a phone's viewport.
              <pre className="font-mono text-sm break-words whitespace-pre-wrap text-muted-foreground">
                {video.transcript}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {video.status === "error" && video.error_message && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-destructive mb-1">Error</h3>
          <p className="text-sm text-destructive/80">{video.error_message}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 h-10 px-3 md:h-7 md:px-2.5 md:text-[0.8rem]"
            onClick={async () => {
              await fetch(`/api/videos/${video.id}/retry`, { method: "POST" });
              window.location.reload();
            }}
          >
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
