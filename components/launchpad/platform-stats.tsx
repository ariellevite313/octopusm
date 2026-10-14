"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

type Stats = {
  totalVolume:    number;
  volume24h:      number;
  earnedSol?:     number;
  earnedArcUsdc?: number;
};

function fmtUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtSol(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  if (n >= 100)   return n.toFixed(0);
  return n.toFixed(2);
}

const FALLBACK: Stats = { totalVolume: 0, volume24h: 0, earnedSol: 0, earnedArcUsdc: 0 };

export function PlatformStats() {
  const [stats, setStats]     = useState<Stats | null>(null);
  const [loaded, setLoaded]   = useState(false);

  useEffect(() => {
    fetch("/api/launchpad/platform-stats")
      .then(r => r.ok ? r.json() : FALLBACK)
      .then((d: Stats) => setStats(d))
      .catch(() => setStats(FALLBACK))
      .finally(() => setLoaded(true));
  }, []);

  const display = stats ?? (loaded ? FALLBACK : null);

  if (!display) {
    return <span className="inline-block h-12 w-full max-w-xl rounded-2xl bg-muted animate-pulse" />;
  }

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:flex sm:flex-wrap sm:items-end sm:gap-x-10">
      {/* Total volume */}
      <div className="col-span-2 flex flex-col gap-1">
        <span className="text-sm text-muted-foreground font-medium">Total volume</span>
        <span className="num text-[38px] leading-none font-bold tracking-[-0.04em] text-foreground sm:text-[44px]">
          {fmtUsd(display.totalVolume)}
        </span>
        <span className="num h-[22px] text-[15px] font-semibold text-up">
          {display.volume24h > 0 ? `+${fmtUsd(display.volume24h)} today` : ""}
        </span>
      </div>

      {/* Earned on Solana */}
      <div className="flex flex-col gap-1 sm:border-l sm:border-border sm:pl-10">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground font-medium">
          <Image src="/solana.png" alt="" width={16} height={16} className="rounded-full" unoptimized />
          Earned on Solana
        </span>
        <span className="num text-[26px] leading-none font-bold tracking-[-0.03em] text-foreground sm:text-[36px]">
          {fmtSol(display.earnedSol ?? 0)} <span className="text-lg font-semibold text-muted-foreground">SOL</span>
        </span>
        <span className="h-[22px] text-[13px] text-muted-foreground">Creator fees claimed</span>
      </div>

      {/* Earned on Arc */}
      <div className="flex flex-col gap-1 sm:border-l sm:border-border sm:pl-10">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground font-medium">
          <Image src="/arc-logo.jpeg" alt="" width={16} height={16} className="rounded-full" unoptimized />
          Earned on Arc
        </span>
        <span className="num text-[26px] leading-none font-bold tracking-[-0.03em] text-foreground sm:text-[36px]">
          {fmtUsd(display.earnedArcUsdc ?? 0)} <span className="text-lg font-semibold text-muted-foreground">USDC</span>
        </span>
        <span className="h-[22px] text-[13px] text-muted-foreground">Creator fees claimed</span>
      </div>
    </div>
  );
}
