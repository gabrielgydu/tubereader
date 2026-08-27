"use client";

import { useCallback } from "react";
import { VideoSubmit } from "@/components/video/video-submit";
import { VideoCard } from "@/components/video/video-card";
import { useVideos, usePipelineSSE } from "@/lib/hooks";

export default function FeedPage() {
  const { videos, loading, refetch } = useVideos();

  usePipelineSSE(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="mb-4 text-xl font-bold md:text-2xl">Feed</h1>
        <VideoSubmit onSubmitted={refetch} />
      </div>

      <div className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : videos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No videos yet. Paste some YouTube, Instagram, or SoundCloud URLs above to get started.
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
