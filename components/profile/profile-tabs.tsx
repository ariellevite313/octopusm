"use client";

import { useEffect, useState } from "react";
import type { ActivityItem, CreatedToken, CreatedMarket } from "@/services/profile-service";
import { ProfileActivityList } from "./profile-activity-list";
import { ProfileTokensList } from "./profile-tokens-list";
import { ProfileMarketsList } from "./profile-markets-list";
import { useT } from "@/lib/i18n";
import { PostCard } from "@/components/social/post-card";
import type { FeedPost } from "@/lib/social/posts";

function ProfilePosts({ wallet }: { wallet: string }) {
  const { tr } = useT();
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  useEffect(() => {
    let off = false;
    fetch(`/api/posts?author=${encodeURIComponent(wallet)}&limit=20`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => !off && setPosts(j.posts ?? []))
      .catch(() => !off && setPosts([]));
    return () => { off = true; };
  }, [wallet]);
  if (!posts) return <div className="h-40 animate-pulse rounded-3xl bg-muted/30" />;
  if (posts.length === 0) return <p className="py-12 text-center text-sm text-muted-foreground">{tr("No posts yet.")}</p>;
  return (
    <div className="divide-y divide-border">
      {posts.map((p) => (
        <PostCard key={p.feed_key ?? p.id} post={p} onRemoved={(id) => setPosts((l) => (l ?? []).filter((x) => x.id !== id))} />
      ))}
    </div>
  );
}

type Tab = "posts" | "activity" | "tokens" | "markets";

/** One scrollable tab row: Recent activity / Tokens launched / Markets created. */
export function ProfileTabs({
  activity, volume, tokens, markets, wallet,
}: {
  activity: ActivityItem[];
  volume: { usdc: number; clt: number };
  tokens: CreatedToken[];
  markets: CreatedMarket[];
  wallet: string;
}) {
  const { tr } = useT();
  const tabs: { id: Tab; label: string }[] = [
    { id: "posts" as const, label: tr("Posts") },
    ...(activity.length ? [{ id: "activity" as const, label: tr("Recent activity") }] : []),
    ...(tokens.length ? [{ id: "tokens" as const, label: tr("Tokens launched") }] : []),
    ...(markets.length ? [{ id: "markets" as const, label: tr("Markets created") }] : []),
  ];
  const [tab, setTab] = useState<Tab | null>(null);
  const current = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;

  return (
    <div>
      <div
        role="tablist"
        className="mb-3 flex gap-5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={current === t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 border-b-2 pb-1 text-lg font-bold tracking-tight transition-colors ${
              current === t.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {current === "posts" && <ProfilePosts wallet={wallet} />}
      {current === "activity" && <ProfileActivityList items={activity} volume={volume} />}
      {current === "tokens" && <ProfileTokensList tokens={tokens} />}
      {current === "markets" && <ProfileMarketsList markets={markets} />}
    </div>
  );
}
