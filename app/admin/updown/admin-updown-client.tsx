"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// BUG-UD-6 FIX: utiliser le client SSR du projet (avec cookies de session)
// plutôt qu'un client anonyme @supabase/supabase-js direct.
function getSupabase() {
  return createClient();
}

interface ClaimedBet {
  id: string;
  market_id: string;
  wallet_address: string;
  direction: "up" | "down";
  amount: number;
  payout: number;
  status: "claimed" | "paid";
  claimed_at: string;
  paid_at: string | null;
  updown_markets: {
    symbol: string;
    duration_min: number;
    strike_price: number;
    open_price: number;
    closes_at: string;
    outcome: string;
  };
}

export function AdminUpDownClient() {
  const [bets, setBets] = useState<ClaimedBet[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);
  const supabase = useRef(getSupabase());

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/updown");
      const d = await res.json() as { bets?: ClaimedBet[]; error?: string };
      if (!res.ok) {
        console.error("[admin/updown] API error:", res.status, d.error);
        toast.error(`API error ${res.status}: ${d.error ?? "unknown"}`);
      } else {
        setBets(d.bets ?? []);
      }
    } catch (e) {
      console.error("[admin/updown] fetch failed:", e);
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const sb = supabase.current;
    const ch = sb
      .channel("admin-updown-claims")
      .on("postgres_changes" as const, {
        event: "UPDATE",
        schema: "public",
        table: "updown_bets",
      }, () => { void load(); })
      .subscribe();
    return () => { void sb.removeChannel(ch); };
  }, []);

  const markPaid = async (bet: ClaimedBet) => {
    setPaying(bet.id);
    const res = await fetch("/api/admin/updown", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bet_id: bet.id }),
    });
    if (res.ok) {
      toast.success(`Marked paid: $${bet.payout.toFixed(2)} to ${bet.wallet_address.slice(0, 8)}...`);
      void load();
    } else {
      toast.error("Error marking as paid");
    }
    setPaying(null);
  };

  const claimed = bets.filter(b => b.status === "claimed");
  const paid    = bets.filter(b => b.status === "paid");

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-bold text-foreground">Up/Down — Pending Claims</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Transfer manually from the treasury wallet, then click Mark as paid.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
      ) : claimed.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No pending claims.
        </div>
      ) : (
        <div className="space-y-3">
          {claimed.map(bet => {
              const isRefund = !bet.payout || bet.payout === 0;
              return (
                <div key={bet.id} className={`rounded-2xl border px-4 py-3 flex items-center justify-between gap-4 flex-wrap ${isRefund ? "border-slate-300/40 bg-slate-50/30 dark:bg-slate-950/10" : "border-amber-400/40 bg-amber-50/30 dark:bg-amber-950/10"}`}>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {bet.updown_markets.symbol.replace("USDT", "")} {bet.updown_markets.duration_min}m
                        {" — "}{bet.direction === "up" ? "↑ UP" : "↓ DOWN"}
                      </p>
                      {isRefund && (
                        <span className="rounded-full bg-slate-200 dark:bg-slate-700 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">REFUND</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">{bet.wallet_address}</p>
                    <p className="text-xs text-muted-foreground">
                      Stake: ${bet.amount} ·{" "}
                      {isRefund
                        ? <span className="font-bold text-slate-600 dark:text-slate-300">Refund: ${bet.amount.toFixed(4)} USDC</span>
                        : <span className="font-bold text-emerald-600">Payout: ${bet.payout.toFixed(4)} USDC</span>
                      }
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Claimed on {new Date(bet.claimed_at).toLocaleString("en-US")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => markPaid(bet)}
                    disabled={paying === bet.id}
                    className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-60 ${isRefund ? "bg-slate-500 hover:bg-slate-600" : "bg-emerald-600 hover:bg-emerald-700"}`}
                  >
                    <CheckCircle className="size-4" />
                    {paying === bet.id ? "..." : isRefund ? "Mark refunded" : "Mark as paid"}
                  </button>
                </div>
              );
            })}
        </div>
      )}

      {paid.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <Clock className="size-4" /> Payment history ({paid.length})
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Wallet</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Round</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Payout</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Paid on</th>
                </tr>
              </thead>
              <tbody>
                {paid.map(bet => (
                  <tr key={bet.id} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-2 font-mono text-muted-foreground">{bet.wallet_address.slice(0, 8)}...{bet.wallet_address.slice(-4)}</td>
                    <td className="px-3 py-2">{bet.updown_markets.symbol.replace("USDT", "")} {bet.updown_markets.duration_min}m {bet.direction === "up" ? "↑" : "↓"}</td>
                    <td className="px-3 py-2 font-semibold">
                      {!bet.payout || bet.payout === 0
                        ? <span className="text-slate-500">Refund ${bet.amount.toFixed(4)}</span>
                        : <span className="text-emerald-600">${bet.payout.toFixed(4)}</span>
                      }
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{bet.paid_at ? new Date(bet.paid_at).toLocaleString("en-US") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
