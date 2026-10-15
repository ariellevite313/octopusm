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

function fmtCompact(n: number | null): string {
  if (n === null || n === 0) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

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
    <div className="mb-8">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <BurningFire />
        <span className="text-lg font-bold tracking-tight text-foreground">Trending</span>
        <span className="text-sm text-muted-foreground">24h volume</span>
      </div>

      {/* Horizontal scroll strip */}
      <div className="-mx-4 flex gap-3 overflow-x-auto scrollbar-none px-4 pb-1">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="shrink-0 w-[208px] h-[118px] rounded-[20px] bg-card animate-pulse border border-border"
              />
            ))
          : tokens.map((t, i) => {
              const isArc = t.chain === "arc";
              // Arc: prioritise mint_address (OMToken ERC-20), fallback to arc_launch_id (curve)
              const slug  = isArc
                ? (t.mint_address ?? t.arc_launch_id ?? t.id)
                : (t.mint_address ?? t.id);
              return (
                <Link
                  key={t.id}
                  href={`/launchpad/${slug}`}
                  className="shrink-0 flex w-[208px] flex-col overflow-hidden rounded-[20px] border border-border bg-card transition-colors hover:border-primary/40"
                >
                  {/* Ticker + rank */}
                  <div className="flex items-center gap-1.5 border-b border-border/70 px-4 py-3">
                    <span className="truncate text-[15px] font-bold text-foreground">{t.ticker}</span>
                    {t.is_verified && (
                      <BadgeCheck className="size-4 shrink-0 fill-primary text-card" />
                    )}
                    {isArc && (
                      <span className="text-[10px] font-bold text-sky-400 bg-sky-400/10 rounded-md px-1 py-0.5">
                        ARC
                      </span>
                    )}
                    <span className="num ml-auto rounded-lg bg-muted px-2 py-0.5 text-[12px] font-bold text-muted-foreground shrink-0">
                      #{i + 1}
                    </span>
                  </div>

                  {/* Logo + 24h volume */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="relative size-10 shrink-0 overflow-hidden rounded-full bg-muted">
                      {t.logo_url ? (
                        <Image src={t.logo_url} alt={t.name} fill className="object-cover" unoptimized />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-muted-foreground">
                          {t.ticker.slice(0, 3)}
                        </div>
                      )}
                    </div>
                    <span className="num truncate text-xl font-bold text-up">
                      {fmtCompact(t.volume_24h_usd)}
                    </span>
                  </div>
                </Link>
              );
            })
        }
      </div>
    </div>
  );
}
