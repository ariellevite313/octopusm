"use client";

import { useCallback, useEffect, useState } from "react";
import { Hash, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import type { FeedPost } from "@/lib/social/posts";
import { PostCard } from "./post-card";
import { CreateMenu } from "./create-menu";

type Tab = "foryou" | "following";

export function FeedClient() {
  const { tr } = useT();
  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState<Tab>("foryou");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const tag = (useSearchParams().get("tag") ?? "").toLowerCase();
  const tq = tag ? `&tag=${encodeURIComponent(tag)}` : "";

  const load = useCallback(async (t: Tab) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/posts?tab=${t}&limit=10${tq}`, { cache: "no-store" });
      const j = await r.json();
      setPosts(j.posts ?? []);
      setNext(j.next ?? null);
    } catch { setPosts([]); setNext(null); }
    setLoading(false);
  }, [tq]);

  useEffect(() => { load(tab); }, [tab, load, isAuthenticated]);

  async function loadMore() {
    if (!next) return;
    setMore(true);
    const r = await fetch(`/api/posts?tab=${tab}&limit=10${tq}&before=${encodeURIComponent(next)}`, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    setPosts((l) => [...l, ...(j.posts ?? [])]);
    setNext(j.next ?? null);
    setMore(false);
  }

  return (
    <div className="mx-auto max-w-xl pb-40">
      <div className="sticky top-0 z-10 flex gap-6 border-b border-border bg-background/90 px-4 pt-3 backdrop-blur">
        {([["foryou", tr("For you")], ["following", tr("Following")]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`border-b-2 pb-2.5 text-base font-bold ${tab === k ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tag && (
        <div className="flex items-center gap-2 px-4 pt-4">
          <span className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-bold text-primary"><Hash className="size-4" />{tag}</span>
          <Link href="/feed" aria-label={tr("Close")} className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><X className="size-4" /></Link>
        </div>
      )}

      {loading ? (
        <div className="space-y-4 p-4">{[0, 1].map((i) => <div key={i} className="h-64 animate-pulse rounded-3xl bg-muted/30" />)}</div>
      ) : posts.length === 0 ? (
        <p className="px-6 py-20 text-center text-sm text-muted-foreground">
          {tab === "following"
            ? tr(isAuthenticated ? "Follow people to see their posts here." : "Connect your wallet to see the people you follow.")
            : tr("No posts yet. Be the first to post.")}
        </p>
      ) : (
        <div className="divide-y divide-border">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} onRemoved={(id) => setPosts((l) => l.filter((x) => x.id !== id))} />
          ))}
        </div>
      )}

      {next && !loading && (
        <div className="flex justify-center py-6">
          <button onClick={loadMore} disabled={more} className="flex items-center gap-2 rounded-full border border-border px-5 py-2 text-sm font-semibold hover:bg-muted">
            {more && <Loader2 className="size-4 animate-spin" />}{tr("Load more")}
          </button>
        </div>
      )}

      <CreateMenu onPosted={(p) => tab === "foryou" && setPosts((l) => [p, ...l])} />
    </div>
  );
}
