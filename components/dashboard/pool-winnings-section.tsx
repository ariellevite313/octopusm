"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Gift, ExternalLink } from "lucide-react";
import { TokenLogo } from "@/components/shared/token-logo";

interface WinningBet {
  id: string;
  market_id: string;
  option_id: string;
  amount: number;
  token: string;
  payout_amount: number;
  net_payout: number;
  paid_at: string | null;
  is_refund: boolean;
  mutuel_markets: {
    id: string;
    title: string;
    slug: string;
    status: string;
    winning_option_id: string | null;
    options: Array<{ id: string; label: string }>;
    admin_notes: string | null;
    bet_token: string;
  } | null;
}

function tokenLabel(token: string) {
  return token === "usdc" ? "USDC" : "ClawdTrust";
}

function decimals(token: string) {
  return token === "usdc" ? 2 : 0;
}

interface Props {
  walletAddress: string;
}

export function PoolWinningsSection({ walletAddress }: Props) {
  const [bets, setBets] = useState<WinningBet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!walletAddress) return;
    fetch("/api/pools/winnings")
      .then(r => r.ok ? r.json() : [])
      .then((data: WinningBet[]) => setBets(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [walletAddress]);

  // unpaid = admin has not yet sent tokens (paid_at is null)
  // paid   = admin marked as paid (paid_at set by admin via "Mark as paid")
  const unpaid = bets.filter(b => !b.paid_at);
  const paid   = bets.filter(b =>  b.paid_at);

  if (loading) {
    return (
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Gift className="size-4 text-emerald-500" />
          <h2 className="text-base font-bold text-foreground">Pool Winnings</h2>
        </div>
        <div className="flex flex-col gap-2">
          {[1, 2].map(i => (
            <div key={i} className="h-16 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  if (bets.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Gift className="size-4 text-emerald-500" />
        <h2 className="text-base font-bold text-foreground">Pool Winnings</h2>
        {unpaid.length > 0 && (
          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
            {unpaid.length}
          </span>
        )}
      </div>

      {/* Awaiting admin payout */}
      {unpaid.length > 0 && (
        <div className="mb-4 flex flex-col gap-3">
          {unpaid.map(bet => {
            const market = bet.mutuel_markets;
            const optLabel = market?.options?.find(o => o.id === bet.option_id)?.label ?? bet.option_id;
            const dec = decimals(bet.token);

            return (
              <div
                key={bet.id}
                className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20"
              >
                <div className="mb-1 flex items-start justify-between gap-2">
                  <p className="flex-1 text-sm font-semibold leading-snug text-foreground line-clamp-2">
                    {market?.title ?? "Pool"}
                  </p>
                  {bet.is_refund ? (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                      REFUND
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                      WIN
                    </span>
                  )}
                </div>

                <p className="mb-3 text-xs text-muted-foreground">
                  Prediction: <span className="font-medium text-foreground">{optLabel}</span>
                  {" "}&middot; Staked:{" "}
                  <span className="inline-flex items-center gap-0.5 font-medium text-foreground">
                    <TokenLogo token={bet.token} className="size-3" />
                    {Number(bet.amount).toFixed(dec)}
                  </span>
                </p>

                <div className="mb-3 flex items-center gap-1.5 rounded-xl bg-amber-100/60 px-3 py-2 dark:bg-amber-900/20">
                  <TokenLogo token={bet.token} className="size-4" />
                  <span className="text-base font-bold text-amber-700 dark:text-amber-400">
                    {bet.net_payout.toFixed(dec)} {tokenLabel(bet.token)}
                  </span>
                  {bet.is_refund && (
                    <span className="ml-1 text-xs text-muted-foreground">(after 5% fee)</span>
                  )}
                </div>

                <p className="text-xs text-amber-600 dark:text-amber-400">
                  An admin will send your {tokenLabel(bet.token)} to your wallet shortly.
                  {market?.slug && (
                    <>
                      {" "}
                      <Link
                        href={`/pools/${market.slug}`}
                        className="inline-flex items-center gap-0.5 underline underline-offset-2"
                      >
                        View pool <ExternalLink className="size-2.5" />
                      </Link>
                    </>
                  )}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Paid by admin */}
      {paid.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Received
          </p>
          {paid.map(bet => {
            const market = bet.mutuel_markets;
            const dec = decimals(bet.token);
            return (
              <div
                key={bet.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {market?.title ?? "Pool"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {bet.is_refund ? "Refund received" : "Winnings received"}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  <TokenLogo token={bet.token} className="size-3.5" />
                  +{bet.net_payout.toFixed(dec)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
