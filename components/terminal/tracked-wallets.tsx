"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { Mirage } from "@/components/shared/mirage";

type W = { id: string; address: string; label: string | null };
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/** Wallets suivis (Solana) : une notification à chaque achat ou vente de token de ces wallets. */
export function TrackedWallets() {
  const { tr } = useT();
  const [list, setList] = useState<W[] | null>(null);
  const [addr, setAddr] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => fetch("/api/terminal/tracked").then((r) => r.json()).then((j) => setList(j.wallets ?? [])).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const valid = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr.trim());
  async function add() {
    setBusy(true);
    const r = await fetch("/api/terminal/tracked", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: addr.trim(), label }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { toast.error(tr(j.error ?? "Could not save")); return; }
    setAddr(""); setLabel(""); load();
  }
  async function del(id: string) {
    await fetch("/api/terminal/tracked", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    load();
  }
  return (
    <section className="mt-6">
      <p className="px-1 text-[15px] font-bold text-foreground">{tr("Tracked wallets")}</p>
      <p className="px-1 text-[13px] text-muted-foreground">{tr("Get a notification each time one of these wallets buys or sells a token. Up to 10.")}</p>
      <div className="mt-2 space-y-2">
        <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder={tr("Solana wallet address")} className="h-11 w-full rounded-2xl bg-muted px-4 font-mono text-[13px] outline-none placeholder:font-sans" />
        <div className="flex gap-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={24} placeholder={tr("Name (optional)")} className="h-11 min-w-0 flex-1 rounded-2xl bg-muted px-4 text-[14px] outline-none" />
          <button disabled={!valid || busy} onClick={add} className="h-11 shrink-0 rounded-2xl bg-foreground px-5 text-[14px] font-bold text-background disabled:opacity-40">{busy ? <Mirage className="size-4" /> : tr("Track")}</button>
        </div>
      </div>
      <div className="mt-2">
        {list?.map((w) => (
          <div key={w.id} className="flex items-center justify-between gap-3 border-b border-border py-2.5">
            <a href={`https://solscan.io/account/${w.address}`} target="_blank" rel="noopener noreferrer" className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-foreground">{w.label ?? short(w.address)}</p>
              {w.label && <p className="font-mono text-[12px] text-muted-foreground">{short(w.address)}</p>}
            </a>
            <button onClick={() => del(w.id)} aria-label={tr("Delete")} className="text-muted-foreground hover:text-foreground"><Trash2 className="size-4" /></button>
          </div>
        ))}
      </div>
    </section>
  );
}
