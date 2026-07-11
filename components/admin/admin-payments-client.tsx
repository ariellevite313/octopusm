"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, LoaderCircle, Plus, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PaymentRow } from "@/lib/supabase/types";

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

function shortAddr(s: string) {
  return s.length > 10 ? `${s.slice(0, 5)}\u2026${s.slice(-4)}` : s;
}

const STATUS_FILTERS = ["all", "pending", "approved", "rejected"] as const;
const FLOWS = ["launch", "listing"] as const;
const TOKENS = ["usdc", "clawdtrust"] as const;
const PAGE_SIZE = 10;

const DEFAULT_MANUAL = {
  userWallet: "",
  title: "",
  amount: "",
  token: "usdc" as "usdc" | "clawdtrust",
  txSignature: "",
  flow: "launch" as typeof FLOWS[number],
};

function StatusBadge({ status }: { status: string }) {
  if (status === "approved")
    return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300 text-xs">Approved</Badge>;
  if (status === "rejected")
    return <Badge className="border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300 text-xs">Rejected</Badge>;
  return <Badge className="border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-300 text-xs">Pending</Badge>;
}

export function AdminPaymentsClient({
  payments,
  currentFilter,
  currentFlow,
  pendingCount,
}: {
  payments: PaymentRow[];
  currentFilter?: string;
  currentFlow?: string; // "launch" | "listing" | undefined
  pendingCount?: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState(DEFAULT_MANUAL);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState("");
  const [page, setPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(payments.length / PAGE_SIZE));
  const paginated = payments.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function changeFilter() { setPage(0); }

  async function review(paymentId: string, status: "approved" | "rejected") {
    setLoading(paymentId + status);
    try {
      const res = await fetch("/api/admin/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, status }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  async function submitManual() {
    if (!manual.userWallet.trim() || !manual.title.trim() || !manual.amount || !manual.txSignature.trim()) {
      setManualError("All fields are required.");
      return;
    }
    setManualLoading(true);
    setManualError("");
    try {
      const res = await fetch("/api/admin/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "manual", ...manual }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Error");
      setShowManual(false);
      setManual(DEFAULT_MANUAL);
      router.refresh();
    } catch (e) {
      setManualError(e instanceof Error ? e.message : "Error");
    } finally {
      setManualLoading(false);
    }
  }

  function buildHref(status: string | undefined, flow: string | undefined) {
    const params = new URLSearchParams();
    if (status && status !== "all") params.set("status", status);
    if (flow && flow !== "all") params.set("flow", flow);
    const qs = params.toString();
    return qs ? `/admin/payments?${qs}` : "/admin/payments";
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((f) => (
              <Link
                key={f}
                href={buildHref(f, currentFlow)}
                onClick={changeFilter}
                className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  (f === "all" && !currentFilter) || currentFilter === f
                    ? "border-orange-400 bg-orange-500 text-white"
                    : "border-border text-muted-foreground hover:border-orange-300 hover:text-foreground"
                }`}
              >
                {f === "all" ? "All" : f}
                {f === "pending" && pendingCount && pendingCount > 0 ? ` (${pendingCount})` : ""}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(["all", ...FLOWS] as const).map((f) => (
              <Link
                key={f}
                href={buildHref(currentFilter, f)}
                onClick={changeFilter}
                className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  (f === "all" && !currentFlow) || currentFlow === f
                    ? "border-zinc-600 bg-zinc-700 text-white"
                    : "border-border text-muted-foreground hover:border-zinc-400 hover:text-foreground"
                }`}
              >
                {f === "all" ? "All flows" : f}
              </Link>
            ))}
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => { setShowManual(true); setManualError(""); }}
          className="rounded-full bg-orange-500 text-white hover:bg-orange-400"
        >
          <Plus className="mr-1 size-3" /> Manual Payment
        </Button>
      </div>

      {/* Mobile cards (hidden on sm+) */}
      <div className="flex flex-col gap-3 sm:hidden">
        {paginated.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No payments.</p>
        )}
        {paginated.map((p) => (
          <div key={p.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium leading-5 line-clamp-2 flex-1">{p.title}</p>
              <StatusBadge status={p.status} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">${p.total_paid_usdc.toFixed(2)}</span>
              <span className="text-xs uppercase text-muted-foreground">{p.token}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">{p.flow}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-mono">{shortAddr(p.user_wallet)}</span>
              <span>{formatDate(p.created_at)}</span>
            </div>
            {p.status === "pending" && (
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!loading}
                  className="flex-1 rounded-full border-emerald-300 text-emerald-700 text-xs hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300"
                  onClick={() => review(p.id, "approved")}
                >
                  {loading === p.id + "approved" ? <LoaderCircle className="size-3 animate-spin mr-1" /> : <CheckCircle2 className="size-3 mr-1" />}
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!loading}
                  className="flex-1 rounded-full border-red-300 text-red-600 text-xs hover:bg-red-50 dark:border-red-700 dark:text-red-400"
                  onClick={() => review(p.id, "rejected")}
                >
                  {loading === p.id + "rejected" ? <LoaderCircle className="size-3 animate-spin mr-1" /> : <XCircle className="size-3 mr-1" />}
                  Reject
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop table (hidden below sm) */}
      <div className="hidden sm:block overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              {["Title", "Wallet", "Amount", "Token", "Flow", "Status", "Created", "Actions"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginated.map((p) => (
              <tr key={p.id} className="hover:bg-muted/20">
                <td className="px-4 py-3">
                  <p className="max-w-[160px] font-medium leading-5 line-clamp-2">{p.title}</p>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{shortAddr(p.user_wallet)}</td>
                <td className="px-4 py-3 font-semibold">${p.total_paid_usdc.toFixed(2)}</td>
                <td className="px-4 py-3 text-xs uppercase">{p.token}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">{p.flow}</span>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={p.status} />
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(p.created_at)}</td>
                <td className="px-4 py-3">
                  {p.status === "pending" && (
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="outline" disabled={!!loading}
                        className="rounded-full border-emerald-300 text-emerald-700 text-xs hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300"
                        onClick={() => review(p.id, "approved")}>
                        {loading === p.id + "approved" ? <LoaderCircle className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
                      </Button>
                      <Button size="sm" variant="outline" disabled={!!loading}
                        className="rounded-full border-red-300 text-red-600 text-xs hover:bg-red-50 dark:border-red-700 dark:text-red-400"
                        onClick={() => review(p.id, "rejected")}>
                        {loading === p.id + "rejected" ? <LoaderCircle className="size-3 animate-spin" /> : <XCircle className="size-3" />}
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {payments.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No payments.</p>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      {/* Manual payment dialog */}
      <Dialog open={showManual} onOpenChange={(o) => { if (!o) { setShowManual(false); setManual(DEFAULT_MANUAL); } }}>
        <DialogContent className="max-w-md border-border">
          <DialogHeader>
            <DialogTitle>Add Manual Payment</DialogTitle>
            <DialogDescription>Record a payment that was confirmed outside the platform.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">User wallet address</label>
              <input className="w-full rounded-xl border border-border bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="Wallet address"
                value={manual.userWallet}
                onChange={(e) => setManual((m) => ({ ...m, userWallet: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Title</label>
              <input className="w-full rounded-xl border border-border bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="Payment description"
                value={manual.title}
                onChange={(e) => setManual((m) => ({ ...m, title: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">Amount</label>
                <input type="number" min="0" step="0.01"
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
                  placeholder="0.00"
                  value={manual.amount}
                  onChange={(e) => setManual((m) => ({ ...m, amount: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">Token</label>
                <select className="w-full rounded-xl border border-border bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
                  value={manual.token}
                  onChange={(e) => setManual((m) => ({ ...m, token: e.target.value as "usdc" | "clawdtrust" }))}>
                  {TOKENS.map((t) => <option key={t} value={t}>{t === "usdc" ? "USDC" : "CLT"}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Flow</label>
              <select className="w-full rounded-xl border border-border bg-card px-3 py-2 capitalize focus:outline-none focus:ring-2 focus:ring-orange-400"
                value={manual.flow}
                onChange={(e) => setManual((m) => ({ ...m, flow: e.target.value as typeof FLOWS[number] }))}>
                {FLOWS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">TX Signature</label>
              <input className="w-full rounded-xl border border-border bg-card px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="Transaction hash"
                value={manual.txSignature}
                onChange={(e) => setManual((m) => ({ ...m, txSignature: e.target.value }))} />
            </div>
            {manualError && <p className="text-sm text-red-500">{manualError}</p>}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 rounded-xl"
                onClick={() => { setShowManual(false); setManual(DEFAULT_MANUAL); }}>
                Cancel
              </Button>
              <Button className="flex-1 rounded-xl bg-orange-500 text-white hover:bg-orange-400"
                disabled={manualLoading} onClick={submitManual}>
                {manualLoading ? <LoaderCircle className="size-4 animate-spin" /> : "Add Payment"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
