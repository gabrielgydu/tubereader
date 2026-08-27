"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/markdown";
import { useReadingSettings } from "@/components/layout/reading-settings";
import type { Video, VideoTimestamp } from "@/lib/types";
import { formatDuration, formatDate, formatViews, secondsToTimestamp } from "@/lib/format";
import { externalUrl, supportsTimestampLinks } from "@/lib/source";
import Link from "next/link";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400",
  metadata: "bg-blue-500/20 text-blue-400",
  downloading: "bg-blue-500/20 text-blue-400",
  transcribing: "bg-purple-500/20 text-purple-400",
  summarizing: "bg-indigo-500/20 text-indigo-400",
  complete: "bg-green-500/20 text-green-400",
  error: "bg-red-500/20 text-red-400",
};

type ExpandLevel = "collapsed" | "summary" | "full";

export function VideoCard({
  video,
  onToggleRead,
}: {
  video: Video;
  onToggleRead?: () => void;
}) {
  const [level, setLevel] = useState<ExpandLevel>("collapsed");
  const { fontCss, fontSize } = useReadingSettings();

  const takeaways: string[] = video.key_takeaways
    ? JSON.parse(video.key_takeaways)
    : [];
  const timestamps: VideoTimestamp[] = video.timestamps
    ? JSON.parse(video.timestamps)
    : [];

  async function toggleRead(e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/videos/${video.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read: !video.read_at }),
    });
    onToggleRead?.();
  }

  function cycleLevel() {
    if (video.status !== "complete") return;
    setLevel((prev) =>
      prev === "collapsed" ? "summary" : prev === "summary" ? "full" : "collapsed"
    );
  }

  return (
    <Card className="overflow-hidden transition-colors hover:bg-accent/30">
      <CardContent className="p-0">
        {/* Collapsed row */}
        <div
          className="flex cursor-pointer gap-3 p-3 sm:gap-4 sm:p-4"
          onClick={cycleLevel}
        >
          {video.thumbnail && (
            <img
              src={video.thumbnail}
              alt=""
              className="h-[63px] w-28 shrink-0 rounded-md object-cover sm:h-[90px] sm:w-40"
            />
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <Link
                href={`/videos/${video.id}`}
                className="line-clamp-2 text-sm leading-snug font-medium hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {video.title || video.youtube_id}
              </Link>
              <div className="flex shrink-0 items-center gap-1.5">
                {video.status === "complete" && (
                  <button
                    onClick={toggleRead}
                    className="tap-target rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    title={video.read_at ? "Mark as unread" : "Mark as read"}
                    aria-label={video.read_at ? "Mark as unread" : "Mark as read"}
                  >
                    {video.read_at ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/></svg>
                    )}
                  </button>
                )}
                <Badge
                  variant="secondary"
                  className={`text-xs ${statusColors[video.status] || ""}`}
                >
                  {video.status}
                </Badge>
              </div>
            </div>
            {/* One truncating line rather than a wrapping row of separate
                spans: wrapping strands a "·" at the end of a line on a narrow
                phone, and this row is the least important thing on the card. */}
            <p className="truncate text-xs text-muted-foreground">
              {[
                video.channel,
                video.duration != null && formatDuration(video.duration),
                video.upload_date && formatDate(video.upload_date),
                video.view_count != null && formatViews(video.view_count),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {video.category && (
              <Badge variant="outline" className="text-xs">
                {video.category}
              </Badge>
            )}
            {video.verdict && (
              <p
                className="text-muted-foreground italic line-clamp-1"
                style={{ fontFamily: fontCss, fontSize: `${fontSize - 1}px` }}
              >
                {video.verdict}
              </p>
            )}
            {video.status === "error" && video.error_message && (
              <p className="text-xs text-destructive line-clamp-1">
                {video.error_message}
              </p>
            )}
          </div>
        </div>

        {/* Summary level */}
        {level !== "collapsed" && video.status === "complete" && (
          <div className="space-y-3 border-t border-border px-3 pt-3 pb-4 sm:px-4">
            {takeaways.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                  Key Takeaways
                </h4>
                <ul className="space-y-1" style={{ fontFamily: fontCss, fontSize: `${fontSize}px` }}>
                  {takeaways.map((t, i) => (
                    <li key={i} className="flex gap-2 text-muted-foreground leading-relaxed">
                      <span>•</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {video.summary && (
              <div>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                  Summary
                </h4>
                <Markdown>{video.summary}</Markdown>
              </div>
            )}
            {timestamps.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                  Timestamps
                </h4>
                <div className="flex flex-wrap gap-2">
                  {timestamps.map((ts, i) =>
                    supportsTimestampLinks(video.platform) ? (
                      <a
                        key={i}
                        href={externalUrl(video, ts.time)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-9 items-center rounded bg-accent px-2.5 py-1.5 text-xs hover:bg-accent/80"
                        title={ts.description}
                      >
                        {secondsToTimestamp(ts.time)} — {ts.label}
                      </a>
                    ) : (
                      <span
                        key={i}
                        className="flex min-h-9 items-center rounded bg-accent px-2.5 py-1.5 text-xs"
                        title={ts.description}
                      >
                        {secondsToTimestamp(ts.time)} — {ts.label}
                      </span>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Full level — transcript */}
        {level === "full" && video.transcript && (
          <div className="border-t border-border px-3 pt-3 pb-4 sm:px-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                Transcript
              </h4>
              <Link
                href={`/videos/${video.id}`}
                className="text-xs text-muted-foreground hover:underline"
              >
                Full view
              </Link>
            </div>
            {/* A preview, so the nested scroll stays — `overscroll-contain`
                keeps a flick from chaining into the page behind it. */}
            <div className="max-h-64 overflow-y-auto overscroll-contain font-mono text-sm whitespace-pre-wrap text-muted-foreground">
              {video.transcript.slice(0, 3000)}
              {video.transcript.length > 3000 && "..."}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
