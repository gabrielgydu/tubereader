"use client";

import { useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { VideoCard } from "@/components/video/video-card";
import { useVideos, usePipelineSSE } from "@/lib/hooks";

/**
 * Browse every video from one channel already in the library, keyed by the
 * platform channel_id. Unlike /channels/[id] this needs no subscription — it
 * is a pure filter over what you have, so nothing new gets downloaded.
 */
export default function ChannelLibraryPage() {
  // Next 16's useParams returns the *canonical URL-encoded* segment (e.g.
  // "sc%3A595245351"), not the decoded value — see canonicalizeURLPart in
  // node_modules/next/dist/client/route-params.js. Decode it so it matches the
  // channel_id stored in the DB (e.g. "sc:595245351"); without this the query
  // re-encodes to "sc%253A595245351" and matches nothing.
  const { channelId: rawChannelId } = useParams<{ channelId: string }>();
  const channelId = rawChannelId
    ? decodeURIComponent(rawChannelId)
    : rawChannelId;
  const params = useMemo(() => ({ channelId, read: "all" }), [channelId]);
  const { videos, loading, refetch } = useVideos(params);

  usePipelineSSE(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  // channel names live on the videos; some rows carry a blank one, so take the
  // first non-empty and fall back to the raw id.
  const name = videos.find((v) => v.channel)?.channel || channelId;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="space-y-2">
        <Link
          href="/channels"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Channels
        </Link>
        {/* Hold an ellipsis until videos load, rather than flashing the raw
            channel_id (e.g. "sc:595245351") we fall back to. */}
        <h1 className="text-xl font-bold md:text-2xl">
          {loading && videos.length === 0 ? "…" : name}
        </h1>
        {!loading && (
          <p className="text-sm text-muted-foreground">
            {videos.length} {videos.length === 1 ? "video" : "videos"} in your
            library
          </p>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : videos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No videos from this channel in your library.
        </p>
      ) : (
        <div className="space-y-3">
          {videos.map((video) => (
            <VideoCard key={video.id} video={video} onToggleRead={refetch} />
          ))}
        </div>
      )}
    </div>
  );
}
