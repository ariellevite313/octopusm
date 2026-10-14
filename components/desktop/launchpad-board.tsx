"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { BadgeCheck, Sparkles, Trophy } from "lucide-react";
import { BurningFire } from "@/components/shared/burning-fire";
import type { LeaderboardEntry } from "@/app/api/leaderboard/route";
import type { LaunchpadToken } from "@/services/launchpad-service";

// Tableau de bord du launchpad sur ordinateur : bandeau des meilleurs
// créateurs + 3 colonnes (Trending, Nouveaux tokens, Leaderboard).

type TrendingToken = {
  id: string; name: string; ticker: string; logo_url: string | null;
  mint_address: string | null; arc_launch_id: string | null; chain: string | null;
  is_verified: boolean; market_cap_usd: number | null; volume_24h_usd: number | null;
};

function usd(n: number | null | undefined): string {
  if (!n) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
function sol(n: number) { return n >= 1 ? n.toFixed(2) : n.toFixed(4); }
function short(a: string) { return `${a.slice(0, 4)}…${a.slice(-4)}`; }
function ago(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s`; if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`; return `${Math.floor(s / 86400)}d`;
}
function slugOf(t: { chain: string | null; mint_address: string | null; arc_launch_id: string | null; id: string }) {
  return t.chain === "arc" ? (t.mint_address ?? t.arc_launch_id ?? t.id) : (t.mint_address ?? t.id);
}

function Logo({ src, alt, size = 40 }: { src: string | null; alt: string; size?: number }) {
  return (
    <div className="relative shrink-0 overflow-hidden rounded-xl bg-muted" style={{ width: size, height: size }}>
      {src ? <Image src={src} alt={alt} fill className="object-cover" unoptimized /> : (
        <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-muted-foreground">{alt.slice(0, 3)}</div>
      )}
    </div>
  );
}

function Panel({ title, icon, children, href }: { title: string; icon: React.ReactNode; children: React.ReactNode; href?: string }) {
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-[22px] border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-[15px] font-bold text-foreground">{icon}{title}</h2>
        {href && <Link href={href} className="text-xs font-semibold text-muted-foreground hover:text-foreground">See all</Link>}
      </header>
      <div className="max-h-[440px] flex-1 overflow-y-auto scrollbar-none">{children}</div>
    </section>
  );
}

function Skeleton() {
  return <div className="space-y-1 p-2">{Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/50" />)}</div>;
}

export function LaunchpadBoard() {
  const [trending, setTrending] = useState<TrendingToken[] | null>(null);
  const [fresh, setFresh]       = useState<LaunchpadToken[] | null>(null);
  const [leaders, setLeaders]   = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    fetch("/api/launchpad/trending").then(r => r.ok ? r.json() : { tokens: [] })
      .then((d: { tokens?: TrendingToken[] }) => setTrending(d.tokens ?? [])).catch(() => setTrending([]));
    const loadFresh = () => fetch("/api/launchpad/tokens?tab=all&sort=new&page=0&limit=12").then(r => r.ok ? r.json() : { tokens: [] })
      .then((d: { tokens?: LaunchpadToken[] }) => setFresh(d.tokens ?? [])).catch(() => setFresh([]));
    loadFresh();
    const id = setInterval(loadFresh, 30_000);
    fetch("/api/leaderboard?period=all").then(r => r.ok ? r.json() : { entries: [] })
      .then((d: { entries?: LeaderboardEntry[] }) => setLeaders(d.entries ?? [])).catch(() => setLeaders([]));
    return () => clearInterval(id);
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

      <div className="grid grid-cols-3 gap-4">
        {/* Trending */}
        <Panel title="Trending" icon={<BurningFire className="!text-[17px]" />}>
          {trending === null ? <Skeleton /> : trending.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No trending tokens yet.</p>
          ) : trending.map((t, i) => (
            <Link key={t.id} href={`/launchpad/${slugOf(t)}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50">
              <span className="num w-4 text-xs font-bold text-muted-foreground">{i + 1}</span>
              <Logo src={t.logo_url} alt={t.ticker} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 truncate text-[15px] font-bold text-foreground">
                  {t.ticker}{t.is_verified && <BadgeCheck className="size-4 shrink-0 fill-primary text-card" />}
                </p>
                <p className="truncate text-xs text-muted-foreground">{t.name}</p>
              </div>
              <div className="text-right">
                <p className="num text-[15px] font-bold text-up">{usd(t.volume_24h_usd)}</p>
                <p className="num text-xs text-muted-foreground">MC {usd(t.market_cap_usd)}</p>
              </div>
            </Link>
          ))}
        </Panel>

        {/* New tokens */}
        <Panel title="New tokens" icon={<Sparkles className="size-4 text-primary" />}>
          {fresh === null ? <Skeleton /> : fresh.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No tokens yet.</p>
          ) : fresh.map((t) => (
            <Link key={t.id} href={`/launchpad/${t.mint_address ?? t.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50">
              <Logo src={t.logo_url} alt={t.ticker} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 truncate text-[15px] font-bold text-foreground">
                  {t.name}{t.is_verified && <BadgeCheck className="size-4 shrink-0 fill-primary text-card" />}
                </p>
                <p className="truncate text-xs text-muted-foreground">${t.ticker} · by {t.creator_display_name ?? short(t.creator_wallet)}</p>
              </div>
              <div className="text-right">
                <p className="num text-[15px] font-bold text-foreground">{usd(t.market_cap_usd)}</p>
                <p className="num text-xs text-muted-foreground">{ago(t.created_at)} ago</p>
              </div>
            </Link>
          ))}
        </Panel>

        {/* Leaderboard */}
        <Panel title="Leaderboard" icon={<Trophy className="size-4 text-primary" />} href="/leaderboard/launchpad">
          {leaders === null ? <Skeleton /> : leaders.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No creators yet.</p>
          ) : leaders.slice(0, 10).map((e) => (
            <Link key={e.walletAddress} href={`/profile/${e.walletAddress}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50">
              <span className={`num w-4 text-sm font-bold ${e.rank === 1 ? "text-amber-400" : e.rank === 2 ? "text-zinc-300" : e.rank === 3 ? "text-orange-400" : "text-muted-foreground"}`}>{e.rank}</span>
              {e.avatarSrc
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={e.avatarSrc} alt="" className="size-10 shrink-0 rounded-full object-cover" />
                : <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">{(e.displayName ?? e.walletAddress).slice(0, 2).toUpperCase()}</span>}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-foreground">{e.displayName ?? short(e.walletAddress)}</p>
                <p className="text-xs text-muted-foreground">{e.tokenCount} tokens</p>
              </div>
              <p className="num text-[15px] font-bold text-up">+{sol(e.totalFeeSol)} SOL</p>
            </Link>
          ))}
        </Panel>
      </div>
    </div>
  );
}
