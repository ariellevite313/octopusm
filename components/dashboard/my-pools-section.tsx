"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, ExternalLink } from "lucide-react";
import { MutuelMarketRow, MutuelOption } from "@/lib/supabase/types";
import { CreatePoolModal } from "@/components/pools/create-pool-modal";
import { TokenLogo } from "@/components/shared/token-logo";

const STATUS_PILL: Record<string, string> = {
  pending:  "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  active:   "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  closed:   "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  resolved: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400",
  rejected:  "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  cancelled: "bg-slate-100 text-slate-600 dark:bg-slate-800/40 dark:text-slate-400",
};

function tokenLabel(token: string) {
  return token === "usdc" ? "USDC" : "ClawdTrust";
}

interface Props {
  walletAddress: string;
}

export function MyPoolsSection({ walletAddress }: Props) {
  const [markets, setMarkets] = useState<MutuelMarketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/pools/mine?wallet=${encodeURIComponent(walletAddress)}`);
        if (!res.ok) return;
        const data = await res.json() as MutuelMarketRow[];
        setMarkets(data.map(m => ({
          ...m,
          options: typeof m.options === "string" ? JSON.parse(m.options) : m.options,
        })));
      } catch { /* silent */ }
      finally { setLoading(false); }
    }
    load();
  }, [walletAddress]);

  function handleCreated(market: MutuelMarketRow) {
    setShowCreate(false);
    setMarkets(prev => [market, ...prev]);
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold text-foreground">My Pools</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="size-3.5" />
          Create Pool
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {[1, 2].map(i => (
            <div key={i} className="h-16 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : markets.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-10 text-center">
          <span className="text-3xl">🎱</span>
          <p className="text-sm text-muted-foreground">You haven&apos;t created any pools yet.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="text-sm font-semibold text-primary underline-offset-2 hover:underline"
          >
            Create your first pool
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {markets.map(market => {
            const options = (market.options ?? []) as MutuelOption[];
            const pool = market.bet_token === "usdc"
              ? market.total_pool_usdc
              : market.total_pool_clt;

            return (
              <div key={market.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    {market.cover_image_src && (
                      <div className="size-10 shrink-0 overflow-hidden rounded-xl border border-border">
                        <img
                          src={market.cover_image_src}
                          alt=""
                          className="size-10 object-cover"
                        />
                      </div>
                    )}
                    <p className="flex-1 text-sm font-semibold leading-snug text-foreground line-clamp-2">
                      {market.title}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${STATUS_PILL[market.status]}`}>
                    {market.status}
                  </span>
                </div>

                <div className="mb-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{options.length} options</span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    Pool:
                    <TokenLogo token={market.bet_token} className="size-3" />
                    <span className="font-semibold text-foreground">
                      {pool.toFixed(market.bet_token === "usdc" ? 2 : 0)} {tokenLabel(market.bet_token)}
                    </span>
                  </span>
                  <span>·</span>
                  <span>{market.bet_count} predictions</span>
                </div>

                {market.status === "rejected" && market.admin_notes && (
                  <p className="mb-2 rounded-xl bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
                    Rejected: {market.admin_notes}
                  </p>
                )}

                {market.status === "resolved" && market.winning_option_id && (
                  <p className="mb-2 text-xs text-purple-600 dark:text-purple-400 font-medium">
                    ✅ Winner: {options.find(o => o.id === market.winning_option_id)?.label}
                  </p>
                )}

                {["active", "closed", "resolved"].includes(market.status) && (
                  <Link
                    href={`/pools/${market.slug}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline underline-offset-2"
                  >
                    View pool
                    <ExternalLink className="size-3" />
                  </Link>
                )}
                </div>
              </div>

            );
          })}
        </div>
      )}

      {showCreate && (
        <CreatePoolModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </section>
  );
}
