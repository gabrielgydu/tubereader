"use client";

import { useState, useEffect } from "react";
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
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Channels</h1>

      <form onSubmit={handleSubscribe} className="flex gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a YouTube channel or Instagram profile URL..."
          className="flex-1"
        />
        <Button type="submit" disabled={loading || !url.trim()} size="sm">
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
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <h3 className="font-medium">{ch.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {ch.last_checked
                      ? `Last checked ${formatTimeAgo(ch.last_checked)}`
                      : "Never checked"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRefresh(ch.id)}
                    disabled={refreshing === ch.id}
                  >
                    {refreshing === ch.id ? "Checking..." : "Check for new"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleUnsubscribe(ch.id)}
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
