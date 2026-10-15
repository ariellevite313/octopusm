"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { BadgeCheck } from "lucide-react";
import { BurningFire } from "@/components/shared/burning-fire";

type TrendingToken = {
  id:             string;
  name:           string;
  ticker:         string;
  logo_url:       string | null;
  mint_address:   string | null;
  arc_launch_id:  string | null;
  chain:          string | null;
  is_verified:    boolean;
  market_cap_usd: number | null;
  volume_24h_usd: number | null;
};

function fmt(n: number | null): string {
  if (!n) return "$0";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function slugOf(t: TrendingToken) {
  return t.chain === "arc" ? (t.mint_address ?? t.arc_launch_id ?? t.id) : (t.mint_address ?? t.id);
}

/** Trending (ordinateur) — 5 grandes cartes égales + jauge de part du volume du jour. */
export function TrendingCards() {
  const [tokens, setTokens] = useState<TrendingToken[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/launchpad/trending")
      .then(r => r.ok ? r.json() : { tokens: [] })
      .then((d: { tokens: TrendingToken[] }) => setTokens(d.tokens ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (!loading && tokens.length === 0) return null;

  const top = tokens.slice(0, 5);
  const totalVol = tokens.reduce((s, t) => s + (t.volume_24h_usd ?? 0), 0);

  return (
    <section className="mb-10">
      <h2 className="mb-4 flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
        <BurningFire className="!text-[20px]" />Trending
        <span className="text-sm font-normal text-muted-foreground">24h volume</span>
      </h2>
      <div className="grid grid-cols-5 gap-4">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-[22px] bg-muted/50" />)
          : top.map((t, i) => {
              const share = totalVol > 0 ? Math.round(((t.volume_24h_usd ?? 0) / totalVol) * 100) : 0;
              return (
                <Link key={t.id} href={`/launchpad/${slugOf(t)}`} className="group block">
                  <div className="relative aspect-square overflow-hidden rounded-[22px] bg-muted">
                    {t.logo_url
                      ? <Image src={t.logo_url} alt={t.name} fill className="object-cover transition-transform duration-500 group-hover:scale-[1.04]" unoptimized />
                      : <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-muted-foreground">{t.ticker.slice(0, 3)}</div>}
                    <span className="num absolute left-3 top-2 text-[34px] font-black italic leading-none text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">{i + 1}</span>
                  </div>
                  <div className="px-1 pt-3">
                    <p className="flex min-w-0 items-center gap-1">
                      <span className="truncate text-[17px] font-bold tracking-tight text-foreground">${t.ticker}</span>
                      {t.is_verified && <BadgeCheck className="size-4 shrink-0 fill-primary text-card" />}
                    </p>
                    <p className="num mt-0.5 text-[15px] font-bold text-up">{fmt(t.volume_24h_usd)} <span className="font-normal text-muted-foreground">vol</span></p>
                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(share, 2)}%` }} />
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">{share}% of today&apos;s volume</p>
                  </div>
                </Link>
              );
            })}
      </div>
    </section>
  );
}
