"use client";

import { useEffect, useState } from "react";

type Stats = {
  totalVolume: number;
  volume24h:   number;
};

function fmtUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

const FALLBACK: Stats = { totalVolume: 0, volume24h: 0 };

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

  return (
    <div className="flex items-baseline gap-3 mb-5">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
        Total volume
      </span>
      {display ? (
        <>
          <span className="flex items-center gap-1.5">
            <span className="text-2xl font-semibold text-foreground">
              {fmtUsd(display.totalVolume)}
            </span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{flexShrink:0}}>
              <path d="M12 2C12 2 10 6 10 9C10 9 8 7 8 4C8 4 4 7 4 12C4 16.418 7.582 20 12 20C16.418 20 20 16.418 20 12C20 8 17 5 17 5C17 5 16 8 14 9C14 9 14 5 12 2Z" fill="#f97316"/>
              <path d="M12 13C12 13 11 15 11 16.5C11 17.328 11.672 18 12.5 18C13.328 18 14 17.328 14 16.5C14 15 13 13 13 13H12Z" fill="#fbbf24"/>
            </svg>
          </span>
          {display.volume24h > 0 && (
            <span className="text-xs text-emerald-500 font-medium">
              +{fmtUsd(display.volume24h)} today
            </span>
          )}
        </>
      ) : (
        <span className="h-7 w-28 rounded-md bg-muted/40 animate-pulse inline-block" />
      )}
    </div>
  );
}
