"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { LaunchpadToken } from "@/services/launchpad-service";
import { TokenCard } from "@/components/launchpad/launchpad-client";
import { BurningFire } from "@/components/shared/burning-fire";
import type { LeaderboardEntry } from "@/app/api/leaderboard/route";

// Tableau de bord du launchpad sur ordinateur : bandeau des meilleurs
// créateurs + 10 cartes Trending sur une ligne.

function sol(n: number) { return n >= 1 ? n.toFixed(2) : n.toFixed(4); }
function short(a: string) { return `${a.slice(0, 4)}…${a.slice(-4)}`; }




export function LaunchpadBoard() {
  const [trending, setTrending] = useState<LaunchpadToken[] | null>(null);
  const [leaders, setLeaders]   = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    fetch("/api/launchpad/tokens?tab=all&sort=volume&page=0&limit=10").then(r => r.ok ? r.json() : { tokens: [] })
      .then((d: { tokens?: LaunchpadToken[] }) => setTrending(d.tokens ?? [])).catch(() => setTrending([]));
    fetch("/api/leaderboard?period=all").then(r => r.ok ? r.json() : { entries: [] })
      .then((d: { entries?: LeaderboardEntry[] }) => setLeaders(d.entries ?? [])).catch(() => setLeaders([]));
  }, []);

  const tickerItems = (leaders ?? []).slice(0, 12);

  return (
    <div className="mb-8 hidden lg:block">
      {/* Top creators ticker */}
      {tickerItems.length > 0 && (
        <div className="ticker-mask mb-5 overflow-hidden border-y border-border/60 py-2.5">
          <div className="ticker-track flex w-max gap-8">
            {[...tickerItems, ...tickerItems].map((e, i) => (
              <Link key={`${e.walletAddress}-${i}`} href={`/profile/${e.walletAddress}`} className="flex shrink-0 items-center gap-2 text-sm">
                {e.avatarSrc
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={e.avatarSrc} alt="" className="size-5 rounded-full object-cover" />
                  : <span className="flex size-5 items-center justify-center rounded-full bg-primary/20 text-[9px] font-bold text-primary">{(e.displayName ?? e.walletAddress).slice(0, 1)}</span>}
                <span className="font-semibold text-foreground">@{e.displayName ?? short(e.walletAddress)}</span>
                <span className="num font-bold text-up">+{sol(e.totalFeeSol)} SOL</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Trending — 10 cartes sur une ligne */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold tracking-tight text-foreground">
          <BurningFire className="!text-[20px]" />Trending
          <span className="text-sm font-normal text-muted-foreground">24h volume</span>
        </h2>
        {trending === null ? (
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="aspect-[3/4] w-[210px] shrink-0 animate-pulse rounded-[22px] bg-muted/50" />)}
          </div>
        ) : trending.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">No trending tokens yet.</p>
        ) : (
          <div className="-mx-2 flex snap-x gap-4 overflow-x-auto px-2 pb-6 pt-1 scrollbar-none">
            {trending.slice(0, 10).map((t) => (
              <div key={t.id} className="card-burn w-[210px] shrink-0 snap-start">
                <TokenCard token={t} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
