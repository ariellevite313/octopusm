"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ExternalLink, Clock } from "lucide-react";
import { TokenLogo } from "@/components/shared/token-logo";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PoolMarket {
  id: string;
  title: string;
  slug: string;
  status: string;
  options: Array<{ id: string; label: string }>;
  bet_token: string;
  winning_option_id: string | null;
  admin_notes: string | null;
}

interface ValidatedBet {
  id: string;
  market_id: string;
  option_id: string;
  amount: number;
  token: string;
  payout_amount: number | null;
  net_payout: number | null;
  is_refund: boolean;
  paid_at: string | null;
  created_at: string;
  mutuel_markets: PoolMarket | null;
}

interface PendingBet {
  id: string;
  market_id: string;
  selection_id: string;
  selection_label: string;
  amount_usdc: number;
  token: string;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dec(token: string) {
  return token === "usdc" ? 2 : 0;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function betStatus(bet: ValidatedBet): {
  label: string;
  color: string;
} {
  const market = bet.mutuel_markets;
  if (!market) return { label: "Unknown", color: "text-muted-foreground" };

  if (market.status === "cancelled") {
    if (bet.payout_amount !== null) return { label: "Refunded", color: "text-slate-500" };
    return { label: "Cancelled", color: "text-slate-500" };
  }

  if (market.status === "resolved") {
    const isWinner = market.winning_option_id === bet.option_id;
    if (!isWinner) return { label: "Lost", color: "text-red-500" };
    return { label: "Won", color: "text-emerald-500" };
  }

  if (market.status === "closed") return { label: "Awaiting resolution", color: "text-amber-500" };
  if (market.status === "active")  return { label: "Active", color: "text-emerald-500" };
  return { label: market.status, color: "text-muted-foreground" };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  walletAddress: string;
}

export function MyPoolBetsSection({ walletAddress }: Props) {
  const [bets, setBets] = useState<ValidatedBet[]>([]);
  const [pending, setPending] = useState<PendingBet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!walletAddress) return;
    fetch("/api/pools/my-bets")
      .then(r => r.ok ? r.json() : { bets: [], pending: [] })
      .then((d: { bets: ValidatedBet[]; pending: PendingBet[] }) => {
        setBets(d.bets.map(b => ({
          ...b,
          mutuel_markets: b.mutuel_markets
            ? {
                ...b.mutuel_markets,
                options: typeof b.mutuel_markets.options === "string"
                  ? JSON.parse(b.mutuel_markets.options)
                  : b.mutuel_markets.options,
              }
            : null,
        })));
        setPending(d.pending);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [walletAddress]);

  if (loading) {
    return (
      <section>
        <h2 className="mb-3 text-base font-bold text-foreground">My Pool Predictions</h2>
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-14 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  if (bets.length === 0 && pending.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-base font-bold text-foreground">My Pool Predictions</h2>
      </div>

      <div className="flex flex-col gap-2">

        {/* Pending validation */}
        {pending.map(p => (
          <div
            key={p.id}
            className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/20"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{p.selection_label}</p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="size-3" /> Awaiting admin validation
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="flex items-center justify-end gap-1 text-sm font-semibold text-foreground">
                <TokenLogo token={p.token} className="size-3.5" />
                {Number(p.amount_usdc).toFixed(dec(p.token))}
              </p>
              <p className="text-[11px] text-amber-600 dark:text-amber-400">pending</p>
            </div>
          </div>
        ))}

        {/* Validated bets */}
        {bets.map(bet => {
          const market = bet.mutuel_markets;
          const optLabel = market?.options?.find(o => o.id === bet.option_id)?.label ?? bet.option_id;
          const status = betStatus(bet);
          // BUG-07 fix: use net_payout pre-calculated by the API (no more double 5% deduction)
          const netPayout = bet.net_payout;

          return (
            <div
              key={bet.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {market?.title ?? "Pool"}
                  </p>
                  {market?.slug && (
                    <Link
                      href={`/pools/${market.slug}`}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="size-3" />
                    </Link>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {optLabel} &middot; {fmtDate(bet.created_at)}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="flex items-center justify-end gap-1 text-sm font-semibold text-foreground">
                  <TokenLogo token={bet.token} className="size-3.5" />
                  {Number(bet.amount).toFixed(dec(bet.token))}
                </p>
                <p className={`text-[11px] ${status.color}`}>{status.label}</p>
                {netPayout !== null && (
                  <p className="flex items-center justify-end gap-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                    +<TokenLogo token={bet.token} className="size-2.5" />
                    {netPayout.toFixed(dec(bet.token))}
                  </p>
                )}
              </div>
            </div>
          );
        })}

      </div>
    </section>
  );
}
