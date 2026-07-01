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
          className="flex gap-4 p-4 cursor-pointer"
          onClick={cycleLevel}
        >
          {video.thumbnail && (
            <img
              src={video.thumbnail}
              alt=""
              className="w-40 h-[90px] object-cover rounded-md shrink-0"
            />
          )}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <Link
                href={`/videos/${video.id}`}
                className="font-medium text-sm leading-snug hover:underline line-clamp-2"
                onClick={(e) => e.stopPropagation()}
              >
                {video.title || video.youtube_id}
              </Link>
              <div className="flex items-center gap-1.5 shrink-0">
                {video.status === "complete" && (
                  <button
                    onClick={toggleRead}
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    title={video.read_at ? "Mark as unread" : "Mark as read"}
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
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {video.channel && <span>{video.channel}</span>}
              {video.duration != null && (
                <>
                  <span>·</span>
                  <span>{formatDuration(video.duration)}</span>
                </>
              )}
              {video.upload_date && (
                <>
                  <span>·</span>
                  <span>{formatDate(video.upload_date)}</span>
                </>
              )}
              {video.view_count != null && (
                <>
                  <span>·</span>
                  <span>{formatViews(video.view_count)}</span>
                </>
              )}
            </div>
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
          <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
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
                        className="text-xs bg-accent px-2 py-1 rounded hover:bg-accent/80"
                        title={ts.description}
                      >
                        {secondsToTimestamp(ts.time)} — {ts.label}
                      </a>
                    ) : (
                      <span
                        key={i}
                        className="text-xs bg-accent px-2 py-1 rounded"
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
          <div className="px-4 pb-4 border-t border-border pt-3">
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
            <div className="max-h-64 overflow-y-auto text-sm font-mono text-muted-foreground whitespace-pre-wrap">
              {video.transcript.slice(0, 3000)}
              {video.transcript.length > 3000 && "..."}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
