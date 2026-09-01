"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { TrendingUp, BadgeCheck } from "lucide-react";

type TrendingToken = {
  id:            string;
  name:          string;
  ticker:        string;
  logo_url:      string | null;
  mint_address:  string | null;
  is_verified:   boolean;
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
    <div className="mb-6">
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-3">
        <TrendingUp className="size-4 text-emerald-400" />
        <span className="text-sm font-semibold text-foreground">Trending</span>
        <span className="text-[10px] text-muted-foreground/60 ml-1">· 24h volume</span>
      </div>

      {/* Horizontal scroll strip */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="shrink-0 w-32 h-16 rounded-xl bg-muted/30 animate-pulse border border-border"
              />
            ))
          : tokens.map((t, i) => (
              <Link
                key={t.id}
                href={`/launchpad/${t.mint_address ?? t.id}`}
                className="shrink-0 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-colors min-w-[148px]"
              >
                {/* Rank */}
                <span className="text-[11px] font-bold text-muted-foreground/50 w-4 shrink-0">
                  #{i + 1}
                </span>

                {/* Logo */}
                <div className="relative size-8 shrink-0 overflow-hidden rounded-lg bg-black">
                  {t.logo_url ? (
                    <Image src={t.logo_url} alt={t.name} fill className="object-cover" unoptimized />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[9px] font-bold text-white/60">
                      {t.ticker.slice(0, 3)}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-0.5">
                    <span className="truncate text-xs font-semibold text-foreground">{t.ticker}</span>
                    {t.is_verified && (
                      <BadgeCheck className="size-3 shrink-0 text-orange-400" />
                    )}
                  </div>
                  <span className="text-[10px] text-emerald-400 font-medium">
                    {fmtCompact(t.volume_24h_usd)}
                  </span>
                </div>
              </Link>
            ))
        }
      </div>
    </div>
  );
}
