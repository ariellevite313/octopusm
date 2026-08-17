"use client";

import { useState, useCallback } from "react";
import { BadgeCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { ConnectedWalletRow } from "@/services/admin-service";

const PAGE_SIZE = 20;

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function VerifyToggle({ address, initial }: { address: string; initial: boolean }) {
  const [verified, setVerified] = useState(initial);
  const [loading, setLoading]   = useState(false);

  const toggle = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/wallets/${address}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verified: !verified }),
      });
      if (!res.ok) throw new Error("Failed");
      setVerified(v => !v);
      toast.success(!verified ? "Créateur vérifié ✓" : "Vérification retirée");
    } catch {
      toast.error("Erreur lors de la mise à jour");
    } finally {
      setLoading(false);
    }
  }, [address, verified]);

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
        verified
          ? "bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25"
          : "bg-muted text-muted-foreground border border-border hover:bg-muted/70"
      }`}
    >
      <BadgeCheck className="size-3.5" />
      {verified ? "Vérifié" : "Non vérifié"}
    </button>
  );
}

export function AdminWalletsClient({ wallets }: { wallets: ConnectedWalletRow[] }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const filtered = wallets.filter((w) => {
    const q = search.toLowerCase();
    return (
      w.address.toLowerCase().includes(q) ||
      (w.username ?? "").toLowerCase().includes(q) ||
      (w.display_name ?? "").toLowerCase().includes(q) ||
      (w.twitter_handle ?? "").toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const slice = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Search */}
      <input
        className="w-full max-w-sm rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
        placeholder="Search address, username, handle..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(0); }}
      />

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              {["Wallet", "Username", "Twitter", "Role", "Vérifié créateur", "Connections", "Last seen", "Payments"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {slice.map((w) => (
              <tr key={w.address} className="hover:bg-muted/20">
                <td className="px-4 py-3">
                  <p className="font-mono text-xs text-foreground">{shortAddr(w.address)}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    First: {fmtDate(w.first_connected_at)}
                  </p>
                </td>
                <td className="px-4 py-3">
                  {w.display_name && <p className="font-medium text-foreground">{w.display_name}</p>}
                  {w.username && <p className="text-xs text-muted-foreground">@{w.username}</p>}
                  {!w.display_name && !w.username && <span className="text-xs text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {w.twitter_handle ? `@${w.twitter_handle.replace(/^@/, "")}` : "—"}
                </td>
                <td className="px-4 py-3">
                  {w.role === "admin" ? (
                    <Badge className="border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800/30 dark:bg-orange-950/20 dark:text-orange-300">Admin</Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">User</Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  <VerifyToggle address={w.address} initial={w.is_creator_verified} />
                </td>
                <td className="px-4 py-3 text-center text-sm font-medium text-foreground">{w.connection_count}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(w.last_connected_at)}</td>
                <td className="px-4 py-3">
                  <div className="text-xs">
                    <span className="text-foreground font-medium">{w.payment_count}</span>
                    <span className="text-muted-foreground"> total</span>
                    {w.approved_payment_count > 0 && (
                      <span className="ml-1 text-emerald-600 dark:text-emerald-400">({w.approved_payment_count} approved)</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No wallets found.</p>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-muted-foreground">{safePage + 1} / {totalPages}</span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={safePage === totalPages - 1}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
