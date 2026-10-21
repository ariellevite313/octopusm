"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Bouton d'action admin : appelle l'API puis rafraîchit la page. */
export function AdminAction({ url, body, label, confirm, danger }: { url: string; body: Record<string, unknown>; label: string; confirm?: string; danger?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run() {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (r.ok) router.refresh();
    else window.alert((await r.json().catch(() => ({}))).error ?? "Error");
  }
  return (
    <button disabled={busy} onClick={run} className={`rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50 ${danger ? "text-down" : ""}`}>
      {label}
    </button>
  );
}

/** Formulaire de bannissement d'un wallet. */
export function BanForm() {
  const router = useRouter();
  const [wallet, setWallet] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function ban() {
    if (!wallet.trim() || !window.confirm("Ban this wallet? Its posts are hidden and connected apps are cut.")) return;
    setBusy(true);
    const r = await fetch("/api/admin/moderation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ban", wallet, reason }) });
    setBusy(false);
    if (r.ok) { setWallet(""); setReason(""); router.refresh(); } else window.alert((await r.json().catch(() => ({}))).error ?? "Error");
  }
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="Wallet address" className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm" />
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm" />
      <button disabled={busy || !wallet.trim()} onClick={ban} className="h-10 rounded-xl bg-foreground px-5 text-sm font-semibold text-background disabled:opacity-50">Ban</button>
    </div>
  );
}
