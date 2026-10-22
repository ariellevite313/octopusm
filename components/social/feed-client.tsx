"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Hash, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import type { FeedPost } from "@/lib/social/posts";
import { PostCard } from "./post-card";
import { CreateMenu } from "./create-menu";
import { WhoToFollowInline } from "./feed-right-rail";

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
  // Bulle « nouveaux posts » : vérifiée toutes les 30 s depuis le post le plus récent affiché
  const since = useRef<string | null>(null);
  const [fresh, setFresh] = useState<{ count: number; avatars: { avatar: string | null; name: string | null }[] }>({ count: 0, avatars: [] });

  // Une citation publiée depuis un post s'ajoute en haut du fil « Pour toi »
  useEffect(() => {
    const on = (e: Event) => { const p = (e as CustomEvent<FeedPost>).detail; if (p && tab === "foryou") setPosts((l) => [p, ...l]); };
    window.addEventListener("feed-post-created", on);
    return () => window.removeEventListener("feed-post-created", on);
  }, [tab]);

  const load = useCallback(async (t: Tab) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/posts?tab=${t}&limit=10${tq}`, { cache: "no-store" });
      const j = await r.json();
      const list = (j.posts ?? []) as FeedPost[];
      setPosts(list);
      setNext(j.next ?? null);
      since.current = list.reduce((m, p) => (p.created_at > m ? p.created_at : m), new Date(Date.now() - 60_000).toISOString());
      setFresh({ count: 0, avatars: [] });
    } catch { setPosts([]); setNext(null); }
    setLoading(false);
  }, [tq]);

  useEffect(() => {
    if (tag) return;
    const check = () => {
      if (document.hidden || !since.current) return;
      fetch(`/api/posts/new?tab=${tab}&since=${encodeURIComponent(since.current)}`, { cache: "no-store" }).then((r) => r.json()).then((j) => setFresh({ count: j.count ?? 0, avatars: j.avatars ?? [] })).catch(() => {});
    };
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [tab, tag]);

  function showFresh() {
    window.scrollTo({ top: 0, behavior: "smooth" });
    load(tab);
  }

  useEffect(() => { load(tab); }, [tab, load, isAuthenticated]);

  async function loadMore() {
    if (!next) return;
    setMore(true);
    const r = await fetch(`/api/posts?tab=${tab}&limit=10${tq}&before=${encodeURIComponent(next)}`, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    setPosts((l) => { const seen = new Set(l.map((x) => x.feed_key ?? x.id)); return [...l, ...((j.posts ?? []) as FeedPost[]).filter((x) => !seen.has(x.feed_key ?? x.id))]; });
    setNext(j.next ?? null);
    setMore(false);
  }

  return (
    <div className="mx-auto max-w-xl pb-40">
      <div className="sticky top-16 z-10 lg:top-0 flex gap-6 border-b border-border bg-background/90 px-4 pt-3 backdrop-blur">
        {([["foryou", tr("For you")], ["following", tr("Following")]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`border-b-2 pb-2.5 text-base font-bold ${tab === k ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
        {fresh.count > 0 && (
          <button
            onClick={showFresh}
            className="absolute left-1/2 top-full mt-3 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground py-1.5 pl-2 pr-4 text-sm font-bold text-background shadow-xl animate-in fade-in slide-in-from-top-2"
          >
            <ArrowUp className="size-4" strokeWidth={2.6} />
            <span className="flex">
              {fresh.avatars.map((a, i) => a.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={a.avatar} alt="" className={`size-6 rounded-full border-2 border-foreground object-cover ${i ? "-ml-2" : ""}`} />
              ) : (
                <span key={i} className={`flex size-6 items-center justify-center rounded-full border-2 border-foreground bg-primary text-[10px] text-white ${i ? "-ml-2" : ""}`}>{a.name?.[0]?.toUpperCase() ?? "?"}</span>
              ))}
            </span>
            {tr("posted")}
          </button>
        )}
      </div>

      {tag && (
        <div className="flex items-center gap-2 px-4 pt-4">
          <span className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-bold text-primary"><Hash className="size-4" />{tag}</span>
          <Link href="/" aria-label={tr("Close")} className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><X className="size-4" /></Link>
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
          {posts.map((p, i) => (
            <div key={p.feed_key ?? p.id}>
              <PostCard post={p} onRemoved={(id) => setPosts((l) => l.filter((x) => x.id !== id))} />
              {i === 3 && tab === "foryou" && !tag && <WhoToFollowInline />}
            </div>
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
