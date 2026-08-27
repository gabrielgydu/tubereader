"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import type { Channel } from "@/lib/types";
import { formatTimeAgo } from "@/lib/format";

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState<number | null>(null);

  async function fetchChannels() {
    const res = await fetch("/api/channels");
    if (res.ok) setChannels(await res.json());
  }

  useEffect(() => {
    fetchChannels();
  }, []);

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      if (res.ok) {
        setUrl("");
        fetchChannels();
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh(channelId: number) {
    setRefreshing(channelId);
    try {
      await fetch(`/api/channels/${channelId}/refresh`, { method: "POST" });
      fetchChannels();
    } finally {
      setRefreshing(null);
    }
  }

  async function handleUnsubscribe(channelId: number) {
    await fetch(`/api/channels/${channelId}`, { method: "DELETE" });
    fetchChannels();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <h1 className="text-xl font-bold md:text-2xl">Channels</h1>

      <form onSubmit={handleSubscribe} className="flex gap-2">
        <Input
          type="url"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a YouTube channel or Instagram profile URL..."
          className="h-11 flex-1 md:h-8"
        />
        <Button
          type="submit"
          disabled={loading || !url.trim()}
          className="h-11 px-4 md:h-7 md:px-2.5 md:text-[0.8rem]"
        >
          {loading ? "Subscribing..." : "Subscribe"}
        </Button>
      </form>

      <div className="space-y-3">
        {channels.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No channel subscriptions yet.
          </p>
        ) : (
          channels.map((ch) => (
            <Card key={ch.id}>
              {/* Name and actions sit side by side once there's room; on a
                  phone the actions drop to their own full-width row rather
                  than squeezing the channel name to nothing. */}
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <Link
                  href={`/channels/${ch.id}`}
                  className="group flex min-w-0 items-center gap-3"
                >
                  {ch.thumbnail && (
                    <img
                      src={ch.thumbnail}
                      alt=""
                      className="size-9 shrink-0 rounded-full object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <h3 className="truncate font-medium group-hover:underline">
                      {ch.name}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {ch.last_checked
                        ? `Last checked ${formatTimeAgo(ch.last_checked)}`
                        : "Never checked"}
                    </p>
                  </div>
                </Link>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleRefresh(ch.id)}
                    disabled={refreshing === ch.id}
                    className="h-10 flex-1 sm:h-7 sm:flex-none sm:px-2.5 sm:text-[0.8rem]"
                  >
                    {refreshing === ch.id ? "Checking..." : "Check for new"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => handleUnsubscribe(ch.id)}
                    className="h-10 flex-1 sm:h-7 sm:flex-none sm:px-2.5 sm:text-[0.8rem]"
                  >
                    Unsubscribe
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
