"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { BurningFire } from "@/components/shared/burning-fire";
import { VerifiedTokenBadge } from "@/components/shared/verified-token-badge";
import { SolanaMark, ArcMark } from "@/components/shared/solana-mark";
import { useT } from "@/lib/i18n";

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

/** Trending (ordinateur) — bandeau compact du Top 20 qui défile tout seul. */
export function TrendingCards() {
  const { tr } = useT();
  const [tokens, setTokens] = useState<TrendingToken[]>([]);

  useEffect(() => {
    fetch("/api/launchpad/trending?limit=20")
      .then(r => r.ok ? r.json() : { tokens: [] })
      .then((d: { tokens: TrendingToken[] }) => setTokens(d.tokens ?? []))
      .catch(() => {});
  }, []);

  if (tokens.length === 0) return null;

  const items = tokens.slice(0, 20);

  return (
    <section className="mb-5 flex items-center gap-3">
      <span className="flex shrink-0 items-center gap-1.5 text-sm font-bold text-foreground">
        <BurningFire className="!text-[15px]" />{tr("Top 20")}
      </span>
      <div className="ticker-mask min-w-0 flex-1 overflow-hidden">
        <div className="ticker-track flex w-max gap-2" style={{ animationDuration: `${Math.max(items.length * 4, 30)}s` }}>
          {[...items, ...items].map((t, i) => (
            <Link
              key={`${t.id}-${i}`}
              href={`/launchpad/${slugOf(t)}`}
              className="flex shrink-0 items-center gap-2 rounded-full bg-muted/60 py-1 pl-1 pr-3 text-[13px] transition-colors hover:bg-muted"
            >
              <span className="num w-6 text-center text-[11px] font-bold text-muted-foreground">#{(i % items.length) + 1}</span>
              <span className="relative size-6 shrink-0 overflow-hidden rounded-[7px] bg-background">
                {t.logo_url && <Image src={t.logo_url} alt="" fill className="object-cover" unoptimized />}
              </span>
              <span className="font-bold text-foreground">{t.ticker}</span>
              {t.chain === "arc" ? <ArcMark className="size-3.5 shrink-0 text-foreground" /> : <SolanaMark className="size-3.5 shrink-0 text-foreground" />}
              {t.is_verified && <VerifiedTokenBadge className="size-3.5" />}
              <span className="num font-semibold text-up">{fmt(t.volume_24h_usd)}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
