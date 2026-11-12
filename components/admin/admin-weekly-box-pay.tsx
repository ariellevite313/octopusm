"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Marquer la box SOL comme payée : coller la signature de la transaction envoyée au gagnant. */
export function WeeklyBoxPay({ week }: { week: string }) {
  const router = useRouter();
  const [tx, setTx] = useState("");
  const [busy, setBusy] = useState(false);
  async function pay() {
    if (!tx.trim()) return;
    setBusy(true);
    const r = await fetch("/api/admin/weekly-box", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ week, paid_tx: tx }) });
    setBusy(false);
    if (r.ok) { setTx(""); router.refresh(); } else window.alert((await r.json().catch(() => ({}))).error ?? "Error");
  }
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input value={tx} onChange={(e) => setTx(e.target.value)} placeholder="Payment transaction signature" className="h-9 flex-1 rounded-xl border border-border bg-background px-3 text-xs" />
      <button disabled={busy || !tx.trim()} onClick={pay} className="h-9 rounded-full bg-foreground px-4 text-xs font-bold text-background disabled:opacity-50">Mark paid</button>
    </div>
  );
}
