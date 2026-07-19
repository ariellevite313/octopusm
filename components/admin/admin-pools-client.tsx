"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, Trophy, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TokenLogo } from "@/components/shared/token-logo";
import type { MutuelMarketRow, MutuelOption } from "@/lib/supabase/types";

function formatDate(d: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending:   "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300",
    active:    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300",
    closed:    "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-300",
    resolved:  "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/40 dark:bg-purple-950/20 dark:text-purple-300",
    rejected:  "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300",
    cancelled: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/20 dark:text-slate-400",
  };
  return (
    <Badge className={`capitalize text-xs ${map[status] ?? map.cancelled}`}>
      {status}
    </Badge>
  );
}

// ─── Reject modal ─────────────────────────────────────────────────────────────

function RejectDialog({
  open,
  onConfirm,
  onCancel,
  loading,
}: {
  open: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-sm border-border">
        <DialogHeader>
          <DialogTitle>Rejection reason</DialogTitle>
        </DialogHeader>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Explain why this pool is rejected..."
          rows={3}
          className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <div className="flex gap-2 mt-2">
          <Button variant="outline" className="flex-1 rounded-xl" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            className="flex-1 rounded-xl bg-red-500 text-white hover:bg-red-400"
            disabled={loading || !reason.trim()}
            onClick={() => onConfirm(reason.trim())}
          >
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : "Confirm Reject"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Resolve modal ────────────────────────────────────────────────────────────

function ResolveDialog({
  market,
  open,
  onConfirm,
  onCancel,
  loading,
}: {
  market: MutuelMarketRow | null;
  open: boolean;
  onConfirm: (winningOptionId: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [selected, setSelected] = useState("");
  const options = (market?.options ?? []) as MutuelOption[];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onCancel(); setSelected(""); } }}>
      <DialogContent className="max-w-sm border-border">
        <DialogHeader>
          <DialogTitle>Resolve Pool</DialogTitle>
        </DialogHeader>
        {market && (
          <>
            <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{market.title}</p>
            <div className="flex flex-col gap-2">
              {options.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setSelected(opt.id)}
                  className={`rounded-xl border px-4 py-2.5 text-sm font-medium text-left transition-colors ${
                    selected === opt.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-foreground hover:border-primary/40"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={onCancel} disabled={loading}>
                Cancel
              </Button>
              <Button
                className="flex-1 rounded-xl bg-emerald-500 text-white hover:bg-emerald-400"
                disabled={loading || !selected}
                onClick={() => onConfirm(selected)}
              >
                {loading ? <LoaderCircle className="size-4 animate-spin" /> : <><Trophy className="mr-1 size-4" />Resolve</>}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main client ──────────────────────────────────────────────────────────────

export function AdminPoolsClient({ pools }: { pools: MutuelMarketRow[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [rejectTarget, setRejectTarget] = useState<MutuelMarketRow | null>(null);
  const [resolveTarget, setResolveTarget] = useState<MutuelMarketRow | null>(null);

  async function callApi(body: Record<string, unknown>) {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/pools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      toast.success("Done");
      router.refresh();
      setRejectTarget(null);
      setResolveTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  const FILTERS = ["all", "pending", "active", "closed", "resolved", "rejected", "cancelled"] as const;
  const [filter, setFilter] = useState<typeof FILTERS[number]>("all");

  const filtered = filter === "all" ? pools : pools.filter((p) => p.status === filter);

  return (
    <>
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count = f === "all" ? pools.length : pools.filter((p) => p.status === f).length;
          const active = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
                active
                  ? "border-orange-400 bg-orange-500 text-white"
                  : "border-border text-muted-foreground hover:border-orange-300 hover:text-foreground"
              }`}
            >
              {f === "all" ? "All" : f} ({count})
            </button>
          );
        })}
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 sm:hidden">
        {filtered.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No pools.</p>
        )}
        {filtered.map((pool) => {
          const options = (pool.options ?? []) as MutuelOption[];
          return (
            <div key={pool.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-foreground line-clamp-2 flex-1">{pool.title}</p>
                <StatusBadge status={pool.status} />
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <TokenLogo token={pool.bet_token} className="size-3.5" />
                <span className="capitalize">{pool.bet_token}</span>
                <span>|</span>
                <span>{options.length} options</span>
                <span>|</span>
                <span>Ends {formatDate(pool.betting_closes_at)}</span>
              </div>
              <div className="flex gap-2">
                {pool.status === "pending" && (
                  <>
                    <Button size="sm" className="flex-1 rounded-full bg-emerald-500 text-white hover:bg-emerald-400"
                      disabled={loading} onClick={() => callApi({ action: "approve", marketId: pool.id })}>
                      <CheckCircle2 className="mr-1 size-3" />Approve
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 rounded-full border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                      disabled={loading} onClick={() => setRejectTarget(pool)}>
                      <XCircle className="mr-1 size-3" />Reject
                    </Button>
                  </>
                )}
                {pool.status === "closed" && (
                  <Button size="sm" className="flex-1 rounded-full bg-purple-500 text-white hover:bg-purple-400"
                    disabled={loading} onClick={() => { setResolveTarget(pool); }}>
                    <Trophy className="mr-1 size-3" />Resolve
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              {["Title", "Token", "Options", "Status", "Ends", "Actions"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">No pools.</td>
              </tr>
            )}
            {filtered.map((pool) => {
              const options = (pool.options ?? []) as MutuelOption[];
              return (
                <tr key={pool.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 max-w-[220px]">
                    <p className="line-clamp-2 font-medium leading-5">{pool.title}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <TokenLogo token={pool.bet_token} className="size-3.5" />
                      <span className="text-xs uppercase">{pool.bet_token === "clawdtrust" ? "CLT" : "USDC"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {options.map((o) => o.label).join(" / ")}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={pool.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(pool.betting_closes_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {pool.status === "pending" && (
                        <>
                          <Button size="sm" className="rounded-full bg-emerald-500 text-white text-xs hover:bg-emerald-400"
                            disabled={loading} onClick={() => callApi({ action: "approve", marketId: pool.id })}>
                            {loading ? <LoaderCircle className="size-3 animate-spin" /> : <><CheckCircle2 className="mr-1 size-3" />Approve</>}
                          </Button>
                          <Button size="sm" variant="outline" className="rounded-full border-red-300 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                            disabled={loading} onClick={() => setRejectTarget(pool)}>
                            <XCircle className="mr-1 size-3" />Reject
                          </Button>
                        </>
                      )}
                      {pool.status === "closed" && (
                        <Button size="sm" className="rounded-full bg-purple-500 text-white text-xs hover:bg-purple-400"
                          disabled={loading} onClick={() => setResolveTarget(pool)}>
                          <Trophy className="mr-1 size-3" />Resolve
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <RejectDialog
        open={!!rejectTarget}
        onConfirm={(reason) => rejectTarget && callApi({ action: "reject", marketId: rejectTarget.id, reason })}
        onCancel={() => setRejectTarget(null)}
        loading={loading}
      />
      <ResolveDialog
        market={resolveTarget}
        open={!!resolveTarget}
        onConfirm={(winningOptionId) => resolveTarget && callApi({ action: "resolve", marketId: resolveTarget.id, winning_option_id: winningOptionId })}
        onCancel={() => setResolveTarget(null)}
        loading={loading}
      />
    </>
  );
}
