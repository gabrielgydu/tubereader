"use client";

import { useMemo } from "react";
import { VideoCard } from "@/components/video/video-card";
import { useVideos } from "@/lib/hooks";

export default function ReadPage() {
  const params = useMemo(() => ({ read: "true" }), []);
  const { videos, loading, refetch } = useVideos(params);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Read</h1>

      <div className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : videos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No read videos yet. Mark videos as read from the feed to see them here.
          </p>
        ) : (
          videos.map((video) => (
            <VideoCard key={video.id} video={video} onToggleRead={refetch} />
          ))
        )}
      </div>
    </div>
  );
}
