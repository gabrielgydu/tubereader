"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/markdown";
import type { Video, Utterance, VideoTimestamp } from "@/lib/types";
import { formatDuration, formatDate, formatViews, secondsToTimestamp } from "@/lib/format";
import { externalUrl, embedUrl, supportsTimestampLinks } from "@/lib/source";
import Link from "next/link";

export default function VideoDetailPage() {
  const params = useParams();
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/videos/${params.id}`)
      .then((r) => r.json())
      .then(setVideo)
      .finally(() => setLoading(false));
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
      video!.transcript || "",
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
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:underline">
          Feed
        </Link>
        <span>/</span>
        <span className="truncate">{video.title || video.youtube_id}</span>
      </div>

      {/* Source embed. YouTube fills a 16:9 frame; the Instagram /embed endpoint
          renders a fixed-layout card, so give it a portrait box without cropping. */}
      {embedUrl(video) && (
        <div
          className={
            video.platform === "instagram"
              ? "mx-auto w-full max-w-[400px] h-[640px] rounded-lg overflow-hidden bg-black"
              : "aspect-video rounded-lg overflow-hidden bg-black"
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
        <h1 className="text-xl font-bold">{video.title || video.youtube_id}</h1>
        <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
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
            {video.platform === "instagram" ? "Open on Instagram ↗" : "Watch on YouTube ↗"}
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
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Transcript</h2>
            <Button variant="outline" size="sm" onClick={handleExport}>
              Export Markdown
            </Button>
          </div>
          <div className="bg-card rounded-lg p-4 max-h-[600px] overflow-y-auto">
            {utterances.length > 0 ? (
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
              <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-mono">
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
            className="mt-2"
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
