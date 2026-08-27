"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Video } from "@/lib/types";
import { formatDuration } from "@/lib/format";
import Link from "next/link";

interface SearchResult extends Video {
  snippet: string;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    const res = await fetch(
      `/api/search?q=${encodeURIComponent(query.trim())}`
    );
    if (res.ok) {
      setResults(await res.json());
    }
    setSearched(true);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <h1 className="text-xl font-bold md:text-2xl">Search</h1>

      {/* h-11 on touch, back to the compact desktop sizing at md. */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search transcripts, titles, summaries..."
          className="h-11 flex-1 md:h-8"
        />
        <Button type="submit" className="h-11 px-4 md:h-7 md:px-2.5 md:text-[0.8rem]">
          Search
        </Button>
      </form>

      <div className="space-y-3">
        {searched && results.length === 0 ? (
          <p className="text-sm text-muted-foreground">No results found.</p>
        ) : (
          results.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/videos/${r.id}`}
                    className="font-medium text-sm hover:underline"
                  >
                    {r.title || r.youtube_id}
                  </Link>
                  {r.category && (
                    <Badge variant="outline" className="text-xs shrink-0">
                      {r.category}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground flex gap-2">
                  {r.channel && <span>{r.channel}</span>}
                  {r.duration != null && (
                    <>
                      <span>·</span>
                      <span>{formatDuration(r.duration)}</span>
                    </>
                  )}
                </div>
                {r.snippet && (
                  <p
                    className="text-sm text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: r.snippet }}
                  />
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
