"use client";

import { useEffect, useState } from "react";

function getStatus(eventStartAt: string): "live" | "upcoming" | "none" {
  const start = new Date(eventStartAt).getTime();
  const now = Date.now();
  if (now >= start) return "live";
  if (start - now < 7 * 24 * 60 * 60 * 1000) return "upcoming";
  return "none";
}

function formatCountdown(eventStartAt: string): string {
  const diff = new Date(eventStartAt).getTime() - Date.now();
  if (diff <= 0) return "LIVE";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m ${secs}s`;
}

export function MarketCountdownBadge({ eventStartAt }: { eventStartAt: string }) {
  const [mounted, setMounted] = useState(false);
  const [, setTick] = useState(0);
  useEffect(() => {
    setMounted(true);
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!mounted) return null;

  const status = getStatus(eventStartAt);

  if (status === "live") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
        </span>
        LIVE
      </span>
    );
  }

  if (status === "upcoming") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">
        {formatCountdown(eventStartAt)}
      </span>
    );
  }

  return null;
}

export function useIsMarketLive(eventStartAt: string | null | undefined): boolean {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (!eventStartAt) return false;
  return getStatus(eventStartAt) === "live";
}
