"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { VideoCard } from "@/components/video/video-card";
import { useVideos, usePipelineSSE } from "@/lib/hooks";
import type { Channel } from "@/lib/types";

function ChannelFeed({ channelId }: { channelId: string }) {
  const params = useMemo(() => ({ channelId, read: "all" }), [channelId]);
  const { videos, loading, refetch } = useVideos(params);

  usePipelineSSE(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }
  if (videos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No videos from this channel yet. Use &ldquo;Check for new&rdquo; on the
        Channels page to fetch its latest videos.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {videos.map((video) => (
        <VideoCard key={video.id} video={video} onToggleRead={refetch} />
      ))}
    </div>
  );
}

type ChannelState = { forId: string; channel: Channel | null };

export default function ChannelFeedPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<ChannelState | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/channels/${id}`).then(async (res) => {
      if (!active) return;
      const channel = res.ok ? ((await res.json()) as Channel) : null;
      setState({ forId: id, channel });
    });
    return () => {
      active = false;
    };
  }, [id]);

  // Ignore results from a previous id while navigating between channels.
  const resolved = state?.forId === id ? state : null;
  const channel = resolved?.channel ?? null;
  const missing = resolved != null && resolved.channel == null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="space-y-2">
        <Link
          href="/channels"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Channels
        </Link>
        <div className="flex items-center gap-3">
          {channel?.thumbnail && (
            <img
              src={channel.thumbnail}
              alt=""
              className="w-10 h-10 rounded-full object-cover shrink-0"
            />
          )}
          <h1 className="text-xl font-bold md:text-2xl">
            {channel ? channel.name : missing ? "Channel not found" : "…"}
          </h1>
        </div>
      </div>

      {channel && <ChannelFeed channelId={channel.channel_id} />}
      {missing && (
        <p className="text-sm text-muted-foreground">
          This channel does not exist.
        </p>
      )}
    </div>
  );
}
