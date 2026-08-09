"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, LoaderCircle, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

type TokenRow = {
  id: string;
  name: string;
  ticker: string;
  category: string;
  status: "pending" | "active" | "graduating" | "graduated" | "cancelled";
  is_tradeable: boolean;
  is_scheduled: boolean;
  scheduled_at: string | null;
  mint_address: string | null;
  pool_address: string | null;
  creator_wallet: string;
  supply: number;
  vanity_job_id: string | null;
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

function statusLabel(t: TokenRow): string {
  if (t.status === "active" && !t.is_tradeable) return "Scheduled";
  if (t.status === "active" && t.is_tradeable)  return "Live";
  return t.status.charAt(0).toUpperCase() + t.status.slice(1);
}


function short(s: string): string {
  return `${s.slice(0, 5)}…${s.slice(-4)}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function fmtSupply(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(0)}B`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(0)}M`;
  return n.toLocaleString();
}

// ── Component ─────────────────────────────────────────────────────────────────

type Filter = "all" | "pending" | "active" | "graduating" | "graduated" | "cancelled";

export function AdminLaunchpadClient({ tokens }: { tokens: TokenRow[] }) {
  const router                    = useRouter();
  const [filter, setFilter]       = useState<Filter>("all");
  const [loading, setLoading]     = useState<string | null>(null);
  const [confirm, setConfirm]     = useState<string | null>(null); // tokenId awaiting cancel confirm

  const counts = {
    all:        tokens.length,
    pending:    tokens.filter(t => t.status === "pending").length,
    active:     tokens.filter(t => t.status === "active").length,
    graduating: tokens.filter(t => t.status === "graduating").length,
    graduated:  tokens.filter(t => t.status === "graduated").length,
    cancelled:  tokens.filter(t => t.status === "cancelled").length,
  };

  const visible = filter === "all"
    ? tokens
    : tokens.filter(t => t.status === filter);

  async function doAction(tokenId: string, action: "cancel" | "retry-vanity") {
    setLoading(tokenId + action);
    setConfirm(null);
    try {
      const res = await fetch("/api/admin/launchpad", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action, tokenId }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        toast.error(d.error ?? "Action failed");
        return;
      }
      toast.success(action === "cancel" ? "Token cancelled" : "Vanity generation restarted");
      router.refresh();
    } catch {
      toast.error("Network error — please retry");
    } finally {
      setLoading(null);
    }
  }

  // ── Filter bar ───────────────────────────────────────────────────────────────
  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all",        label: `All (${counts.all})` },
    { key: "pending",    label: `Pending (${counts.pending})` },
    { key: "active",     label: `Active (${counts.active})` },
    { key: "graduating", label: `Graduating (${counts.graduating})` },
    { key: "graduated",  label: `Graduated (${counts.graduated})` },
    { key: "cancelled",  label: `Cancelled (${counts.cancelled})` },
  ];

  return (
    <div className="space-y-4">

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              {["Token", "Creator", "Supply", "Status", "Created", "Actions"].map(h => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.map(token => {
              const isBusy = (key: string) => loading === token.id + key;

              return (
                <tr key={token.id} className="hover:bg-muted/20">

                  {/* Token */}
                  <td className="px-4 py-3">
                    <p className="font-semibold">{token.name}</p>
                    <p className="text-xs font-mono text-muted-foreground">${token.ticker}</p>
                    <span className="text-[11px] text-muted-foreground">{token.category}</span>
                    {token.mint_address && (
                      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        {short(token.mint_address)}
                      </p>
                    )}
                  </td>

                  {/* Creator */}
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {short(token.creator_wallet)}
                  </td>

                  {/* Supply */}
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    {fmtSupply(token.supply)}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_PILL[token.status] ?? ""}`}>
                      {statusLabel(token)}
                    </span>
                    {token.is_scheduled && token.scheduled_at && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {fmtDate(token.scheduled_at)}
                      </p>
                    )}
                  </td>

                  {/* Created */}
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {fmtDate(token.created_at)}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">

                      {/* View token page */}
                      <a
                        href={`/launchpad/${token.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button size="sm" variant="ghost" className="rounded-full px-2" title="View token page">
                          <ExternalLink className="size-3" />
                        </Button>
                      </a>

                      {/* Birdeye */}
                      {token.mint_address && (
                        <a
                          href={`https://birdeye.so/token/${token.mint_address}?chain=solana`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button size="sm" variant="ghost" className="rounded-full px-2 text-[10px]" title="Birdeye">
                            🦅
                          </Button>
                        </a>
                      )}

                      {/* Cancel — not for already cancelled or graduated */}
                      {token.status !== "cancelled" && token.status !== "graduated" && (
                        confirm === token.id ? (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!!loading}
                              className="rounded-full border-red-400 bg-red-50 text-red-600 text-xs hover:bg-red-100 dark:border-red-700 dark:bg-red-950/20 dark:text-red-400"
                              onClick={() => doAction(token.id, "cancel")}
                            >
                              {isBusy("cancel")
                                ? <LoaderCircle className="size-3 animate-spin" />
                                : "Confirm"
                              }
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="rounded-full text-xs"
                              onClick={() => setConfirm(null)}
                            >
                              No
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!!loading}
                            title="Cancel token"
                            className="rounded-full border-red-300 text-red-600 text-xs hover:bg-red-50 dark:border-red-700 dark:text-red-400"
                            onClick={() => setConfirm(token.id)}
                          >
                            <Ban className="size-3" />
                          </Button>
                        )
                      )}

                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {visible.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No tokens found.
          </p>
        )}
      </div>
    </div>
  );
}
