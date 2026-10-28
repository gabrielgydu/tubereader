"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Channel, LibraryChannel } from "@/lib/types";
import { formatTimeAgo } from "@/lib/format";

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [library, setLibrary] = useState<LibraryChannel[]>([]);
  const [filter, setFilter] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState<number | null>(null);

  async function fetchChannels() {
    const res = await fetch("/api/channels");
    if (res.ok) setChannels(await res.json());
  }

  async function fetchLibrary() {
    const res = await fetch("/api/library/channels");
    if (res.ok) setLibrary(await res.json());
  }

  useEffect(() => {
    fetchChannels();
    fetchLibrary();
  }, []);

  const filteredLibrary = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return library;
    return library.filter((c) => c.name.toLowerCase().includes(q));
  }, [library, filter]);

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
        fetchLibrary();
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
      fetchLibrary();
    } finally {
      setRefreshing(null);
    }
  }

  async function handleUnsubscribe(channelId: number) {
    await fetch(`/api/channels/${channelId}`, { method: "DELETE" });
    fetchChannels();
    fetchLibrary();
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

      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Subscriptions
      </h2>
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

      {/* Browse by channel — everything already in the library, grouped by
          channel, whether or not it's subscribed. Lets you read all of one
          channel's transcripts without subscribing (which would start pulling
          its whole back catalog). */}
      {library.length > 0 && (
        <div className="space-y-3 border-t border-border pt-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Browse by channel
            </h2>
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter channels…"
              autoCapitalize="none"
              autoCorrect="off"
              className="h-10 sm:h-8 sm:w-64"
            />
          </div>

          {filteredLibrary.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No channels match &ldquo;{filter}&rdquo;.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {filteredLibrary.map((ch) => (
                <li key={ch.channel_id}>
                  <Link
                    href={`/channels/by/${encodeURIComponent(ch.channel_id)}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent/40"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{ch.name}</span>
                      {ch.subscribed && (
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          Subscribed
                        </Badge>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {ch.count} {ch.count === 1 ? "video" : "videos"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
