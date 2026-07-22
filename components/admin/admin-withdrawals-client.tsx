"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { CheckCircle2, XCircle, Banknote, LoaderCircle, Clock, Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { WithdrawalRow, WithdrawalToken, WithdrawalStatus } from "@/lib/supabase/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function shortAddr(addr: string) { return `${addr.slice(0, 4)}…${addr.slice(-4)}`; }

function CopyAddr({ addr }: { addr: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(addr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      onClick={copy}
      title={addr}
      className="flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
      {shortAddr(addr)}
    </button>
  );
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtAmount(token: WithdrawalToken, amount: number) {
  if (token === "usdc") {
    return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`;
  }
  const n = amount >= 1_000_000 ? `${(amount / 1_000_000).toFixed(2)}M` : amount >= 1_000 ? `${(amount / 1_000).toFixed(1)}K` : amount.toLocaleString("en-US");
  return `${n} CLT`;
}

function netAmount(token: WithdrawalToken, gross: number): number {
  return token === "usdc"
    ? Math.round(gross * 0.95 * 100) / 100
    : Math.floor(gross * 0.95);
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: WithdrawalStatus }) {
  const map: Record<WithdrawalStatus, string> = {
    pending:  "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300",
    approved: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300",
    rejected: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300",
    paid:     "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${map[status]}`}>
      {status}
    </span>
  );
}

// ─── Reject dialog ────────────────────────────────────────────────────────────

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
          <DialogTitle>Reject withdrawal</DialogTitle>
          <DialogDescription>Provide a reason (optional) — it will be logged.</DialogDescription>
        </DialogHeader>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for rejection…"
          rows={3}
          className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <div className="flex gap-2 mt-2">
          <Button variant="outline" className="flex-1 rounded-xl" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button
            className="flex-1 rounded-xl bg-red-500 text-white hover:bg-red-400"
            disabled={loading}
            onClick={() => onConfirm(reason.trim())}
          >
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : "Confirm Reject"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Mark paid dialog ─────────────────────────────────────────────────────────

function MarkPaidDialog({
  open,
  row,
  onConfirm,
  onCancel,
  loading,
}: {
  open: boolean;
  row: WithdrawalRow | null;
  onConfirm: (tx: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [tx, setTx] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-sm border-border">
        <DialogHeader>
          <DialogTitle>Mark as Paid</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-1.5 text-sm">
              {row && (
                <>
                  <div className="flex items-center gap-1.5 flex-wrap text-muted-foreground">
                    <span>Requested:</span>
                    <span className="font-medium text-foreground">{fmtAmount(row.token, row.amount)}</span>
                    <span>→</span>
                    <CopyAddr addr={row.wallet_address} />
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20 px-3 py-2">
                    <p className="text-xs text-emerald-700 dark:text-emerald-300">
                      <span className="font-bold">Send to user: {fmtAmount(row.token, netAmount(row.token, row.amount))}</span>
                      <span className="ml-1 opacity-70">(after 5% platform fee)</span>
                    </p>
                  </div>
                </>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Transaction signature (optional)
          </label>
          <input
            value={tx}
            onChange={(e) => setTx(e.target.value)}
            placeholder="5Xk3… (Solana tx)"
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div className="flex gap-2 mt-2">
          <Button variant="outline" className="flex-1 rounded-xl" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button
            className="flex-1 rounded-xl bg-emerald-500 text-white hover:bg-emerald-400"
            disabled={loading}
            onClick={() => onConfirm(tx.trim())}
          >
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : <><Check className="mr-1 size-4" />Confirm Paid</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const FILTERS = ["all", "pending", "approved", "rejected", "paid"] as const;

export function AdminWithdrawalsClient({ withdrawals: initialWithdrawals }: { withdrawals: WithdrawalRow[] }) {
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>(initialWithdrawals);
  const [filter, setFilter] = useState<typeof FILTERS[number]>("all");
  const [loading, setLoading] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<WithdrawalRow | null>(null);
  const [paidTarget, setPaidTarget] = useState<WithdrawalRow | null>(null);

  // Client-side fetch — bypasses SSR caching issues entirely
  const fetchWithdrawals = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/withdrawals", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json() as { withdrawals: WithdrawalRow[] };
      if (data.withdrawals) setWithdrawals(data.withdrawals);
    } catch { /* silent — keep previous data */ }
  }, []);

  // Poll every 15 s
  useEffect(() => {
    const interval = setInterval(fetchWithdrawals, 15_000);
    return () => clearInterval(interval);
  }, [fetchWithdrawals]);

  // Realtime (instant) — requires: ALTER PUBLICATION supabase_realtime ADD TABLE withdrawal_requests;
  useEffect(() => {
    const sb = createClient();
    const channel = sb
      .channel("admin-withdrawal-updates")
      .on("postgres_changes" as const, { event: "INSERT", schema: "public", table: "withdrawal_requests" }, () => {
        void fetchWithdrawals();
      })
      .on("postgres_changes" as const, { event: "UPDATE", schema: "public", table: "withdrawal_requests" }, () => {
        void fetchWithdrawals();
      })
      .subscribe();
    return () => { void sb.removeChannel(channel); };
  }, [fetchWithdrawals]);

  const filtered = filter === "all" ? withdrawals : withdrawals.filter((w) => w.status === filter);

  async function callApi(body: Record<string, unknown>) {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      toast.success("Done");
      await fetchWithdrawals();
      setRejectTarget(null);
      setPaidTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count = f === "all" ? withdrawals.length : withdrawals.filter((w) => w.status === f).length;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
                filter === f
                  ? "border-orange-400 bg-orange-500 text-white"
                  : "border-border text-muted-foreground hover:border-orange-300 hover:text-foreground"
              }`}
            >
              {f} ({count})
            </button>
          );
        })}
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 sm:hidden">
        {filtered.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No withdrawal requests.</p>
        )}
        {filtered.map((w) => (
          <div key={w.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-foreground">{fmtAmount(w.token, w.amount)}</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  → {fmtAmount(w.token, netAmount(w.token, w.amount))} net
                </p>
                <CopyAddr addr={w.wallet_address} />
              </div>
              <StatusBadge status={w.status} />
            </div>
            <p className="text-xs text-muted-foreground">{formatDate(w.created_at)}</p>
            <div className="flex gap-2">
              {w.status === "pending" && (
                <>
                  <Button size="sm" className="flex-1 rounded-full bg-emerald-500 text-white hover:bg-emerald-400"
                    disabled={loading} onClick={() => callApi({ action: "approve", id: w.id })}>
                    <CheckCircle2 className="mr-1 size-3" />Approve
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 rounded-full border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                    disabled={loading} onClick={() => setRejectTarget(w)}>
                    <XCircle className="mr-1 size-3" />Reject
                  </Button>
                </>
              )}
              {w.status === "approved" && (
                <>
                  <Button size="sm" className="flex-1 rounded-full bg-blue-500 text-white hover:bg-blue-400"
                    disabled={loading} onClick={() => setPaidTarget(w)}>
                    <Banknote className="mr-1 size-3" />Mark Paid
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 rounded-full border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                    disabled={loading} onClick={() => setRejectTarget(w)}>
                    <XCircle className="mr-1 size-3" />Reject
                  </Button>
                </>
              )}
            </div>
            {w.rejection_reason && (
              <p className="text-xs text-red-500">Reason: {w.rejection_reason}</p>
            )}
            {w.paid_tx && (
              <p className="text-xs text-muted-foreground font-mono truncate">TX: {w.paid_tx}</p>
            )}
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              {["Wallet", "Token", "Amount", "Status", "Date", "Actions"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">No withdrawal requests.</td>
              </tr>
            )}
            {filtered.map((w) => (
              <tr key={w.id} className="hover:bg-muted/20">
                <td className="px-4 py-3"><CopyAddr addr={w.wallet_address} /></td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold uppercase">
                    {w.token === "usdc" ? "USDC" : "CLT"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <p className="font-semibold">{fmtAmount(w.token, w.amount)}</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    → {fmtAmount(w.token, netAmount(w.token, w.amount))} net
                  </p>
                </td>
                <td className="px-4 py-3"><StatusBadge status={w.status} /></td>
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(w.created_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {w.status === "pending" && (
                      <>
                        <Button size="sm" className="rounded-full bg-emerald-500 text-white text-xs hover:bg-emerald-400"
                          disabled={loading} onClick={() => callApi({ action: "approve", id: w.id })}>
                          {loading ? <LoaderCircle className="size-3 animate-spin" /> : <><CheckCircle2 className="mr-1 size-3" />Approve</>}
                        </Button>
                        <Button size="sm" variant="outline" className="rounded-full border-red-300 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                          disabled={loading} onClick={() => setRejectTarget(w)}>
                          <XCircle className="mr-1 size-3" />Reject
                        </Button>
                      </>
                    )}
                    {w.status === "approved" && (
                      <>
                        <Button size="sm" className="rounded-full bg-blue-500 text-white text-xs hover:bg-blue-400"
                          disabled={loading} onClick={() => setPaidTarget(w)}>
                          {loading ? <LoaderCircle className="size-3 animate-spin" /> : <><Banknote className="mr-1 size-3" />Mark Paid</>}
                        </Button>
                        <Button size="sm" variant="outline" className="rounded-full border-red-300 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                          disabled={loading} onClick={() => setRejectTarget(w)}>
                          <XCircle className="mr-1 size-3" />Reject
                        </Button>
                      </>
                    )}
                    {w.status === "paid" && w.paid_tx && (
                      <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[120px]" title={w.paid_tx}>
                        TX: {w.paid_tx.slice(0, 8)}…
                      </span>
                    )}
                    {w.status === "rejected" && w.rejection_reason && (
                      <span className="text-xs text-red-500 truncate max-w-[120px]" title={w.rejection_reason}>
                        {w.rejection_reason}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RejectDialog
        open={!!rejectTarget}
        onConfirm={(reason) => rejectTarget && callApi({ action: "reject", id: rejectTarget.id, reason })}
        onCancel={() => setRejectTarget(null)}
        loading={loading}
      />
      <MarkPaidDialog
        open={!!paidTarget}
        row={paidTarget}
        onConfirm={(paid_tx) => paidTarget && callApi({ action: "mark_paid", id: paidTarget.id, paid_tx })}
        onCancel={() => setPaidTarget(null)}
        loading={loading}
      />
    </>
  );
}
