"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import type { LeaderboardEntry } from "@/app/api/leaderboard/predictions/route";

type LeaderboardToken  = "usdc" | "clt" | "octo";
type LeaderboardPeriod = "24h" | "7d" | "31d" | "all";
import { OctoBadge } from "@/components/leaderboard/octo-tier-badge";

// ─── Config ───────────────────────────────────────────────────────────────────

const TOKENS: { key: LeaderboardToken; label: string; logo: string; unit: string; prefix: string }[] = [
  { key: "usdc", label: "USDC",  logo: "/usdc-coin.png",        unit: "USDC", prefix: "+$" },
  { key: "clt",  label: "ClawdTrust", logo: "/clawdtrust-coin.png", unit: "CLT", prefix: "+" },
  { key: "octo", label: "OMERO",  logo: "/octo-coin.png",        unit: "OMERO", prefix: "+"  },
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

    fetch(`/api/leaderboard/predictions?token=${token}&period=${period}&limit=100`, { signal: controller.signal })
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
      {/* ── Token cards ───────────────────────────────────────────────── */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-foreground">Best winners</h2>
      </div>
      <div className="-mx-4 mb-6 flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-none">
        {TOKENS.map((t) => (
          <button
            key={t.key}
            onClick={() => setToken(t.key)}
            className={`flex w-[150px] shrink-0 flex-col items-center gap-2 rounded-[24px] border px-3 pb-4 pt-5 transition-all ${
              token === t.key
                ? "border-primary/60 bg-card"
                : "border-border bg-card/60 hover:bg-card"
            }`}
          >
            <Image src={t.logo} alt={t.label} width={56} height={56} className="size-14 shrink-0 rounded-2xl object-cover" />
            <span className="text-[15px] font-bold text-foreground">{t.label}</span>
            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${
              token === t.key ? "border-foreground/40 text-foreground" : "border-border text-muted-foreground"
            }`}>
              {token === t.key ? "Selected" : "View"}
            </span>
          </button>
        ))}
      </div>

      {/* ── Filters row ───────────────────────────────────────────────── */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5">
          <Image src={tokenCfg.logo} alt={tokenCfg.label} width={18} height={18} className="rounded-full" />
          <span className="text-sm font-bold text-foreground">{tokenCfg.label}</span>
        </div>
        <div className="flex items-center gap-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`rounded-xl px-3 py-1.5 text-sm font-bold transition-all ${
                period === p.key
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-2 px-1 text-[13px] text-muted-foreground">
        Top {tokenCfg.label} winners · {periodCfg.label}
      </p>

      {/* ── List ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-[72px] animate-pulse rounded-2xl bg-muted/60" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-down/12 py-12 text-center text-sm text-down">
          {error}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-[22px] bg-card py-14 text-center text-sm text-muted-foreground">
          No winners found for this period.
        </div>
      ) : (
        <div className="flex flex-col">
          {entries.map((entry) => {
            const name = entry.display_name ?? shortAddress(entry.wallet_address);
            return (
              <Link
                key={entry.wallet_address}
                href={`/profile/${entry.wallet_address}`}
                className="flex items-center gap-3 rounded-2xl px-1 py-3 transition-colors hover:bg-muted/40"
              >
                {/* Rank */}
                <RankMark rank={entry.rank} />

                {/* Avatar */}
                <div className="relative shrink-0">
                  {entry.avatar_src ? (
                    <Image
                      src={entry.avatar_src}
                      alt={name}
                      width={56}
                      height={56}
                      unoptimized
                      className="size-14 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex size-14 items-center justify-center rounded-full bg-muted text-xl font-bold text-foreground">
                      {name[0].toUpperCase()}
                    </div>
                  )}
                  {entry.octo_balance > 0 && (
                    <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-background p-0.5">
                      <OctoBadge totalOcto={entry.octo_balance} size={14} />
                    </span>
                  )}
                </div>

                {/* Name */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[17px] font-semibold tracking-tight text-foreground">{name}</p>
                  <p className="truncate font-mono text-[13px] text-muted-foreground">
                    {entry.display_name ? shortAddress(entry.wallet_address) : (token === "octo" ? "total earned" : `${entry.win_count} win${entry.win_count !== 1 ? "s" : ""}`)}
                  </p>
                </div>

                {/* Gains */}
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="num text-[17px] font-bold text-up">
                    {tokenCfg.prefix}{fmt(entry.total_gains)}
                  </span>
                  <span className="flex items-center gap-1 rounded-full bg-muted py-0.5 pl-0.5 pr-2 text-[11px] font-semibold text-muted-foreground">
                    <Image src={tokenCfg.logo} alt={tokenCfg.label} width={16} height={16} className="rounded-full" />
                    {token === "octo" ? tokenCfg.unit : `${entry.win_count} win${entry.win_count !== 1 ? "s" : ""}`}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Net gains (payouts − stakes) · Click a profile to see details
      </p>
    </div>
  );
}

// ─── Rank mark : laurier pour le top 3 ─────────────────────────────────────

const LAUREL = ["#f5b301", "#c9c9d3", "#e0712b"];

function RankMark({ rank }: { rank: number }) {
  if (rank > 3) {
    return <span className="num w-11 shrink-0 text-center text-base font-semibold text-muted-foreground">{rank}.</span>;
  }
  const c = LAUREL[rank - 1];
  return (
    <span className="relative flex h-9 w-11 shrink-0 items-center justify-center" aria-label={`Rank ${rank}`}>
      <svg viewBox="0 0 44 36" className="absolute inset-0 h-full w-full" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <g key={i} fill={c}>
            <ellipse cx={9 - i * 1.2} cy={24 - i * 7} rx="2.2" ry="4.4" transform={`rotate(${-30 + i * 18} ${9 - i * 1.2} ${24 - i * 7})`} />
            <ellipse cx={35 + i * 1.2} cy={24 - i * 7} rx="2.2" ry="4.4" transform={`rotate(${30 - i * 18} ${35 + i * 1.2} ${24 - i * 7})`} />
          </g>
        ))}
        <path d="M10 31 Q22 36 34 31" stroke={c} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg>
      <span className="num relative text-lg font-black" style={{ color: c }}>{rank}</span>
    </span>
  );
}
