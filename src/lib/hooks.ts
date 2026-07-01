"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Video, PipelineEvent } from "./types";

export function useVideos(params?: {
  status?: string;
  category?: string;
  channelId?: string;
  sort?: string;
  read?: string;
}) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVideos = useCallback(async () => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    if (params?.category) searchParams.set("category", params.category);
    if (params?.channelId) searchParams.set("channelId", params.channelId);
    if (params?.sort) searchParams.set("sort", params.sort);
    if (params?.read) searchParams.set("read", params.read);

    const qs = searchParams.toString();
    const res = await fetch(`/api/videos${qs ? `?${qs}` : ""}`);
    if (res.ok) {
      setVideos(await res.json());
    }
    setLoading(false);
  }, [params?.status, params?.category, params?.channelId, params?.sort, params?.read]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  return { videos, loading, refetch: fetchVideos };
}

export function usePipelineSSE(onEvent: (event: PipelineEvent) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const es = new EventSource("/api/pipeline/status");
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as PipelineEvent;
        onEventRef.current(event);
      } catch {
        // ignore parse errors
      }
    };
    return () => es.close();
  }, []);
}
