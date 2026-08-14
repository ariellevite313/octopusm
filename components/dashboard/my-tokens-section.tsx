"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ExternalLink, Rocket, Clock, AlertCircle } from "lucide-react";
import { ClaimFeesButton } from "@/components/dashboard/claim-fees-button";

// ── Types ─────────────────────────────────────────────────────────────────────

type MyToken = {
  id: string;
  name: string;
  ticker: string;
  category: string;
  logo_url: string | null;
  status: "pending" | "active" | "graduating" | "graduated" | "cancelled";
  is_tradeable: boolean;
  is_scheduled: boolean;
  scheduled_at: string | null;
  mint_address: string | null;
  pool_address: string | null;
  creator_wallet: string | null;
  supply: number;
  created_at: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_PILL: Record<string, string> = {
  pending:    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  active:     "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  graduating: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  graduated:  "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  cancelled:  "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

function statusLabel(token: MyToken): string {
  if (token.status === "active" && !token.is_tradeable) return "Scheduled";
  if (token.status === "active" && token.is_tradeable)  return "Live";
  return token.status.charAt(0).toUpperCase() + token.status.slice(1);
}

function statusPillClass(token: MyToken): string {
  if (token.status === "active" && !token.is_tradeable) {
    return "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400";
  }
  return STATUS_PILL[token.status] ?? "bg-muted text-muted-foreground";
}

function formatSupply(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(0)}B`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(0)}M`;
  return n.toLocaleString();
}

function fmtAddr(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-6)}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Token Card ─────────────────────────────────────────────────────────────────

function TokenCard({ token }: { token: MyToken }) {
  const isPending   = token.status === "pending";
  const isScheduled = token.status === "active" && !token.is_tradeable;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="p-4 flex items-start gap-3">

        {/* Logo — use <img> to avoid next/image domain restrictions for R2/external CDN */}
        <div className="size-11 shrink-0 overflow-hidden rounded-xl border border-border bg-muted flex items-center justify-center">
          {token.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={token.logo_url}
              alt={token.name}
              className="size-11 object-cover"
            />
          ) : (
            <span className="text-lg font-bold text-muted-foreground">
              {token.ticker.slice(0, 1)}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground truncate">{token.name}</p>
              <p className="text-xs text-muted-foreground font-mono">${token.ticker}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusPillClass(token)}`}>
              {statusLabel(token)}
            </span>
          </div>

          {/* Meta */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{token.category}</span>
            <span>·</span>
            <span>Supply {formatSupply(token.supply)}</span>
            <span>·</span>
            <span>Created {fmtDate(token.created_at)}</span>
          </div>

          {/* Mint address */}
          {token.mint_address && (
            <p className="text-[11px] font-mono text-muted-foreground">
              Mint: {fmtAddr(token.mint_address)}
            </p>
          )}

          {/* Scheduled date */}
          {isScheduled && token.scheduled_at && (
            <div className="flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400">
              <Clock className="size-3.5 shrink-0" />
              Launches {fmtDate(token.scheduled_at)}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-3 pt-0.5">
            {/* Pending: show Launch button */}
            {isPending && (
              <Link
                href={`/launchpad/${token.id}`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline underline-offset-2"
              >
                <Rocket className="size-3.5" />
                Complete launch
              </Link>
            )}

            {/* Active/live: view token page */}
            {(token.status === "active" || token.status === "graduating" || token.status === "graduated") && (
              <Link
                href={`/launchpad/${token.id}`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline underline-offset-2"
              >
                View token
                <ExternalLink className="size-3.5" />
              </Link>
            )}

            {/* Claim trading fees — only for live/graduated tokens with a pool */}
            {token.pool_address &&
              (token.status === "active" || token.status === "graduating" || token.status === "graduated") &&
              token.is_tradeable && (
                <ClaimFeesButton
                  tokenId={token.id}
                  walletAddress={token.creator_wallet ?? ""}
                  poolAddress={token.pool_address}
                />
            )}

            {/* Pool on-chain link */}
            {token.pool_address && (
              <a
                href={`https://birdeye.so/token/${token.pool_address}?chain=solana`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Birdeye
                <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

interface Props {
  walletAddress: string;
}

export function MyTokensSection({ walletAddress }: Props) {
  const [tokens, setTokens]   = useState<MyToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  useEffect(() => {
    async function load() {
      setError(false);
      try {
        // No wallet param — the API reads the wallet from the session cookie
        const res = await fetch("/api/launchpad/mine");
        if (!res.ok) { setError(true); return; }
        const data = await res.json() as MyToken[];
        setTokens(data);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    void load();
  // walletAddress kept in deps so it re-fetches if the wallet switches
  }, [walletAddress]);

  return (
    <section>
      {/* Header */}
      <div className="mb-3">
        <h2 className="text-base font-bold text-foreground">My Tokens</h2>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex flex-col gap-2">
          {[1, 2].map(i => (
            <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center gap-2.5 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          Failed to load your tokens. Please refresh the page.
        </div>
      ) : tokens.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-10 text-center">
          <span className="text-3xl">🐙</span>
          <p className="text-sm text-muted-foreground">You haven&apos;t launched any tokens yet.</p>
          <Link
            href="/launchpad/create"
            className="text-sm font-semibold text-primary underline-offset-2 hover:underline"
          >
            Launch your first token
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {tokens.map(token => (
            <TokenCard key={token.id} token={token} />
          ))}
        </div>
      )}
    </section>
  );
}
