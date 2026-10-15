"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { LaunchpadToken } from "@/services/launchpad-service";
import Image from "next/image";
import { BadgeCheck } from "lucide-react";
import { BurningFire } from "@/components/shared/burning-fire";
import type { LeaderboardEntry } from "@/app/api/leaderboard/route";

// Tableau de bord du launchpad sur ordinateur : bandeau des meilleurs
// créateurs + 10 cartes Trending sur une ligne.

function vol(n: number | null | undefined): string {
  if (!n) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
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
          <div className="grid grid-cols-10 gap-3">
            {Array.from({ length: 10 }).map((_, i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl bg-muted/50" />)}
          </div>
        ) : trending.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">No trending tokens yet.</p>
        ) : (
          <div className="grid grid-cols-10 gap-3 pb-5">
            {trending.slice(0, 10).map((t, i) => (
              <div key={t.id} className="card-burn min-w-0">
                <Link href={`/launchpad/${t.mint_address ?? t.id}`}
                  className="group block overflow-hidden rounded-2xl border border-border bg-card p-1.5 transition-colors hover:bg-muted/60">
                  <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-muted">
                    {t.logo_url
                      ? <Image src={t.logo_url} alt={t.name} fill className="object-cover transition-transform duration-300 group-hover:scale-105" unoptimized />
                      : <div className="flex h-full w-full items-center justify-center text-xs font-bold text-muted-foreground">{t.ticker.slice(0, 4)}</div>}
                    <span className="num absolute left-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-md">#{i + 1}</span>
                  </div>
                  <div className="px-1 pb-0.5 pt-1.5">
                    <p className="flex min-w-0 items-center gap-1">
                      <span className="truncate text-[13px] font-bold text-foreground">{t.name}</span>
                      {t.is_verified && <BadgeCheck className="size-3.5 shrink-0 fill-primary text-card" />}
                    </p>
                    <p className="num truncate text-[13px] font-bold text-up">{vol(t.volume_24h_usd)}</p>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
