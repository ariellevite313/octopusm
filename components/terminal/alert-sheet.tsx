"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { Mirage } from "@/components/shared/mirage";

type Alert = { id: string; kind: "mcap_above" | "mcap_below"; value: number };
const money = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`);
const parse = (s: string) => Number(s.replace(/[\s,$]/g, "").replace(/k$/i, "e3").replace(/m$/i, "e6").replace(/b$/i, "e9"));

/** Alerte de capitalisation sur un token : notification quand le seuil est franchi (vérifié chaque minute). */
export function AlertSheet({ chain, mint, symbol, mcap }: { chain: string; mint: string; symbol: string; mcap: number | null }) {
  const { tr } = useT();
  const [list, setList] = useState<Alert[] | null>(null);
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => fetch(`/api/terminal/alerts?mint=${encodeURIComponent(mint)}`).then((r) => r.json()).then((j) => setList(j.alerts ?? [])).catch(() => setList([]));
  useEffect(() => { load(); }, [mint]); // eslint-disable-line react-hooks/exhaustive-deps

  const target = parse(v);
  const ok = Number.isFinite(target) && target > 0 && mcap != null && target !== mcap;
  const kind = mcap != null && target < mcap ? "mcap_below" : "mcap_above";
  async function add() {
    if (!ok) return;
    setBusy(true);
    const r = await fetch("/api/terminal/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chain, mint, symbol, kind, value: target }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { toast.error(tr(j.error ?? "Could not save the alert")); return; }
    toast.success(tr("Alert saved"));
    setV(""); load();
  }
  async function del(id: string) {
    await fetch("/api/terminal/alerts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    load();
  }
  return (
    <div>
      <p className="text-sm text-muted-foreground">{tr("Get a notification when the market cap of ${symbol} crosses your target.", { symbol })}</p>
      <p className="mt-1 text-[12px] text-muted-foreground">{tr("Stop-loss (SL) and take-profit (TP): the notification opens the sell screen in one tap. You confirm the sale with your wallet.")}</p>
      <p className="num mt-3 text-[13px] text-muted-foreground">{tr("Market cap now")}: <span className="font-semibold text-foreground">{mcap != null ? money(mcap) : "-"}</span></p>
      {mcap != null && (
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {([["SL -20%", 0.8], ["SL -30%", 0.7], ["SL -50%", 0.5], ["TP x2", 2], ["TP x3", 3], ["TP x5", 5]] as const).map(([label, k]) => (
            <button key={label} onClick={() => setV(String(Math.round(mcap * k)))} className="h-9 rounded-xl bg-muted text-[13px] font-semibold text-foreground hover:bg-muted/70">{label}</button>
          ))}
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="1m" className="num h-12 min-w-0 flex-1 rounded-2xl bg-muted px-4 text-[16px] outline-none" />
        <button disabled={!ok || busy} onClick={add} className="h-12 shrink-0 rounded-2xl bg-foreground px-5 text-[15px] font-bold text-background disabled:opacity-40">{busy ? <Mirage className="size-4" /> : tr("Add")}</button>
      </div>
      {ok && <p className="mt-1.5 text-[12px] text-muted-foreground">{tr(kind === "mcap_above" ? "Alert when it goes above {v}" : "Alert when it falls below {v}", { v: money(target) })}</p>}
      <div className="mt-4">
        {list === null ? <Mirage className="mx-auto size-4 text-muted-foreground" />
          : list.map((a) => (
            <div key={a.id} className="flex items-center justify-between border-b border-border py-2.5 text-[14px]">
              <span className="text-foreground">{tr(a.kind === "mcap_above" ? "Above {v}" : "Below {v}", { v: money(Number(a.value)) })}</span>
              <button onClick={() => del(a.id)} aria-label={tr("Delete")} className="text-muted-foreground hover:text-foreground"><Trash2 className="size-4" /></button>
            </div>
          ))}
      </div>
    </div>
  );
}
