"use client";

import { useState, useEffect } from "react";
import { CheckCircle, Loader2 } from "lucide-react";

interface ClaimBet {
  id: string;
  wallet_address: string;
  option_id: string;
  amount: number;
  token: string;
  payout_amount: number;
  claimed_at: string;
  paid_at: string | null;
  mutuel_markets: {
    id: string;
    title: string;
    slug: string;
    winning_option_id: string | null;
    options: Array<{ id: string; label: string }>;
    is_refund: boolean;
  } | null;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtWallet(w: string) {
  return `${w.slice(0, 6)}…${w.slice(-6)}`;
}

function tokenDec(token: string) { return token === "usdc" ? 2 : 0; }
function tokenLabel(token: string) { return token === "usdc" ? "USDC" : "ClawdTrust"; }

export function AdminPoolClaimsClient() {
  const [claims, setClaims] = useState<ClaimBet[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);
  const [txInputs, setTxInputs] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/pools/claims");
      if (res.ok) setClaims(await res.json());
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function markPaid(betId: string) {
    setPaying(betId);
    try {
      const res = await fetch("/api/admin/pools/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betId, payout_tx: txInputs[betId] || null }),
      });
      if (res.ok) {
        setClaims(prev => prev.filter(c => c.id !== betId));
      } else {
        const d = await res.json();
        alert(d.error ?? "Error");
      }
    } finally { setPaying(null); }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading claims…
      </div>
    );
  }

  if (claims.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
        No pending claims — all winnings paid.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {claims.map(bet => {
        const market = bet.mutuel_markets;
        const dec = tokenDec(bet.token);
        const netPayout = bet.mutuel_markets?.is_refund
          ? Math.floor(Number(bet.payout_amount) * 0.95 * 1_000_000) / 1_000_000
          : Number(bet.payout_amount);
        const optLabel = market?.options?.find(o => o.id === bet.option_id)?.label ?? bet.option_id;

        return (
          <div key={bet.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground line-clamp-1">
                  {market?.title ?? "Pool"}
                  {bet.mutuel_markets?.is_refund && (
                    <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                      REFUND
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Prediction: <span className="font-medium text-foreground">{optLabel}</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Wallet</p>
                <p className="font-mono text-xs text-foreground">{fmtWallet(bet.wallet_address)}</p>
              </div>
            </div>

            <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span>
                Staked: <span className="font-semibold text-foreground">
                  {Number(bet.amount).toFixed(dec)} {tokenLabel(bet.token)}
                </span>
              </span>
              <span>
                To pay: <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {netPayout.toFixed(dec)} {tokenLabel(bet.token)}
                </span>
                {bet.mutuel_markets?.is_refund && (
                  <span className="ml-1 text-[11px] text-muted-foreground">(after 5% fee)</span>
                )}
              </span>
              <span>Claimed: {fmtDate(bet.claimed_at)}</span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="TX signature (optional)"
                value={txInputs[bet.id] ?? ""}
                onChange={e => setTxInputs(prev => ({ ...prev, [bet.id]: e.target.value }))}
                className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                onClick={() => markPaid(bet.id)}
                disabled={paying === bet.id}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {paying === bet.id ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <CheckCircle className="size-3" />
                )}
                Mark paid
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
