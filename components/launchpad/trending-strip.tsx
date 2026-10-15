"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { BadgeCheck } from "lucide-react";

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

function fmtCompact(n: number | null): string {
  if (n === null || n === 0) return "$0";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(0)}`;
}

function slugOf(t: TrendingToken) {
  return t.chain === "arc" ? (t.mint_address ?? t.arc_launch_id ?? t.id) : (t.mint_address ?? t.id);
}

/** Trending — cartes horizontales (image à gauche, $TICKER, MC, volume). Téléphone et ordinateur. */
export function TrendingStrip() {
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

  return (
    <section className="mb-8">
      <h2 className="mb-4 text-xl font-bold tracking-tight text-foreground">Trending</h2>

      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto scrollbar-none px-4 pb-1 lg:mx-0 lg:px-0">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[124px] w-[300px] shrink-0 animate-pulse rounded-[24px] border border-border bg-card" />
            ))
          : tokens.slice(0, 10).map((t) => (
              <Link
                key={t.id}
                href={`/launchpad/${slugOf(t)}`}
                className="group flex w-[300px] shrink-0 snap-start items-center gap-4 rounded-[24px] border border-border bg-card p-3 transition-colors hover:bg-muted/50"
              >
                <div className="relative size-[96px] shrink-0 overflow-hidden rounded-[18px] bg-muted">
                  {t.logo_url ? (
                    <Image src={t.logo_url} alt={t.name} fill className="object-cover transition-transform duration-300 group-hover:scale-105" unoptimized />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-bold text-muted-foreground">{t.ticker.slice(0, 4)}</div>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-between self-stretch py-1">
                  <div className="min-w-0">
                    <p className="flex min-w-0 items-center gap-1">
                      <span className="truncate text-[17px] font-bold tracking-tight text-foreground">${t.ticker}</span>
                      {t.is_verified && <BadgeCheck className="size-4 shrink-0 fill-primary text-card" />}
                    </p>
                    <p className="num mt-0.5 text-[15px] font-semibold text-foreground">{fmtCompact(t.market_cap_usd)}</p>
                  </div>
                  <p className="num text-[15px] font-semibold text-foreground">
                    {fmtCompact(t.volume_24h_usd)} <span className="font-normal text-muted-foreground">Vol</span>
                  </p>
                </div>
              </Link>
            ))}
      </div>
    </section>
  );
}
