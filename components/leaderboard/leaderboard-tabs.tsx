"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import type { LeaderboardToken, LeaderboardPeriod, LeaderboardEntry } from "@/app/api/leaderboard/route";
import { OctoBadge } from "@/components/leaderboard/octo-tier-badge";

// ─── Config ───────────────────────────────────────────────────────────────────

const TOKENS: { key: LeaderboardToken; label: string; logo: string; unit: string; prefix: string }[] = [
  { key: "usdc", label: "USDC",  logo: "/usdc-coin.png",        unit: "USDC", prefix: "+$" },
  { key: "clt",  label: "ClawdTrust", logo: "/clawdtrust-coin.png", unit: "CLT", prefix: "+" },
  { key: "octo", label: "OCTO",  logo: "/octo-coin.png",        unit: "OCTO", prefix: "+"  },
];

const PERIODS: { key: LeaderboardPeriod; label: string }[] = [
  { key: "24h", label: "24h"      },
  { key: "7d",  label: "7d"       },
  { key: "31d", label: "31d"      },
  { key: "all", label: "All Time" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortAddress(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(2)}k`;
  return n.toFixed(2);
}

function rankDisplay(rank: number) {
  if (rank === 1) return { emoji: "🥇", cls: "text-yellow-500" };
  if (rank === 2) return { emoji: "🥈", cls: "text-zinc-400"   };
  if (rank === 3) return { emoji: "🥉", cls: "text-amber-600"  };
  return { emoji: `#${rank}`, cls: "text-muted-foreground" };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LeaderboardTabs() {
  const [token,   setToken]   = useState<LeaderboardToken>("usdc");
  const [period,  setPeriod]  = useState<LeaderboardPeriod>("all");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const tokenCfg  = TOKENS.find((t) => t.key === token)!;
  const periodCfg = PERIODS.find((p) => p.key === period)!;

  const fetchData = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/leaderboard?token=${token}&period=${period}&limit=20`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        return res.json() as Promise<{ entries: LeaderboardEntry[]; error?: string }>;
      })
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setEntries(json.entries ?? []);
      })
      .catch((err) => {
        if (err.name === "AbortError") return; // tab switched — ignore
        setError("Failed to load leaderboard. Please try again.");
        setEntries([]);
      })
      .finally(() => { setLoading(false); });

    return controller;
  }, [token, period]);

  useEffect(() => {
    const controller = fetchData();
    return () => controller.abort();
  }, [fetchData]);

  return (
    <div>
      {/* ── Token tabs ─────────────────────────────────────────────────── */}
      <div className="mb-3 flex gap-1.5 rounded-xl bg-muted p-1">
        {TOKENS.map((t) => (
          <button
            key={t.key}
            onClick={() => setToken(t.key)}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg px-2 py-2 transition-all ${
              token === t.key
                ? "bg-card shadow-sm"
                : "hover:bg-card/50"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Image src={t.logo} alt={t.label} width={22} height={22} className="shrink-0 rounded-full" />
              <span className={`text-sm font-semibold ${token === t.key ? "text-foreground" : "text-muted-foreground"}`}>
                {t.label}
              </span>
            </div>
            <span className="text-[9px] text-muted-foreground">Best winners</span>
          </button>
        ))}
      </div>

      {/* ── Period tabs ────────────────────────────────────────────────── */}
      <div className="mb-4 flex gap-1 rounded-lg bg-muted p-0.5">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
              period === p.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* ── Context label ──────────────────────────────────────────────── */}
      <div className="mb-3 flex items-center gap-1.5">
        <Image src={tokenCfg.logo} alt={tokenCfg.label} width={20} height={20} className="rounded-full opacity-70" />
        <p className="text-xs text-muted-foreground">
          Top {tokenCfg.label} winners · {periodCfg.label}
        </p>
      </div>

      {/* ── List ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50/60 py-12 text-center text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/10 dark:text-red-400">
          {error}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
          No winners found for this period.
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const { emoji, cls } = rankDisplay(entry.rank);
            const isTop3 = entry.rank <= 3;
            return (
              <Link
                key={entry.wallet_address}
                href={`/profile/${entry.wallet_address}`}
                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors hover:bg-muted/50 ${
                  isTop3
                    ? "border-orange-200 bg-orange-50/60 dark:border-orange-900/50 dark:bg-orange-950/10"
                    : "border-border bg-card"
                }`}
              >
                {/* Rank */}
                <span className={`w-8 shrink-0 text-center text-sm font-bold ${cls}`}>
                  {emoji}
                </span>

                {/* Avatar */}
                {entry.avatar_src ? (
                  <Image
                    src={entry.avatar_src}
                    alt={entry.display_name ?? entry.wallet_address}
                    width={36}
                    height={36}
                    className="size-9 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                    {(entry.display_name ?? entry.wallet_address)[0].toUpperCase()}
                  </div>
                )}

                {/* Name */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {entry.display_name ?? shortAddress(entry.wallet_address)}
                    </p>
                    {entry.octo_balance > 0 && <OctoBadge totalOcto={entry.octo_balance} size={12} />}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {entry.win_count} win{entry.win_count !== 1 ? "s" : ""}
                  </p>
                </div>

                {/* Gains */}
                <div className="flex shrink-0 items-center gap-1.5">
                  <Image src={tokenCfg.logo} alt={tokenCfg.label} width={20} height={20} className="shrink-0 rounded-full" />
                  <span className="text-sm font-bold text-emerald-600">
                    {tokenCfg.prefix}{fmt(entry.total_gains)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-center text-[10px] text-muted-foreground">
        Net gains (payouts − stakes) · Click a profile to see details
      </p>
    </div>
  );
}
