"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import type { Pulse, PulseToken } from "@/lib/terminal-pulse";

const money = (n: number | null | undefined) => (!n ? "-" : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`);
function age(iso: string | null): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
}
const DEX: Record<string, string> = { "pump-fun": "Pump", "meteora-dbc": "Meteora", "letsbonk-fun": "Bonk", "raydium-launchlab": "LaunchLab", pumpswap: "PumpSwap", "meteora-damm-v2": "Meteora", meteora: "Meteora", raydium: "Raydium", "raydium-cpmm": "Raydium" };

function Row({ t, onOpen }: { t: PulseToken; onOpen: (t: PulseToken) => void }) {
  const up = (t.change1h ?? 0) >= 0;
  return (
    <button onClick={() => onOpen(t)} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-muted/50">
      {t.logo
        ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={t.logo} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
        : <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-[12px] font-bold text-muted-foreground">{t.symbol.slice(0, 2).toUpperCase()}</span>}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[14px] font-bold text-foreground"><span className="truncate">{t.symbol}</span><span className="num shrink-0 text-[12px] font-medium text-muted-foreground">{age(t.createdAt)}</span></p>
        <p className="truncate text-[12px] text-muted-foreground">{DEX[t.dexId] ?? t.dexId} · {t.name}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="num text-[13px] font-semibold text-foreground">MC {money(t.mcap)}</p>
        <p className="num text-[12px] text-muted-foreground">V {money(t.volume24h)}{t.change1h != null && <span className={`ml-1.5 ${up ? "text-up" : "text-down"}`}>{up ? "+" : ""}{t.change1h.toFixed(0)}%</span>}</p>
      </div>
    </button>
  );
}

/** Vue Pulse (Solana) : nouveaux tokens, proches de la graduation, tout juste migrés. Rafraîchie toutes les 15 s. */
export function PulseView({ onOpen, pass = () => true }: { onOpen: (t: PulseToken) => void; pass?: (t: PulseToken) => boolean }) {
  const { tr } = useT();
  const [p, setP] = useState<Pulse | null>(null);
  const [col, setCol] = useState<keyof Pulse>("fresh");
  useEffect(() => {
    let off = false;
    const load = () => { if (document.visibilityState === "visible") fetch("/api/terminal/pulse").then((r) => r.json()).then((j) => { if (!off && j.fresh) setP(j); }).catch(() => {}); };
    load();
    const every = setInterval(load, 15_000);
    return () => { off = true; clearInterval(every); };
  }, []);
  const cols: [keyof Pulse, string][] = [["fresh", tr("New")], ["stretch", tr("Final stretch")], ["migrated", tr("Migrated")]];
  const list = (k: keyof Pulse) => !p ? Array.from({ length: 6 }, (_, i) => <div key={i} className="my-1.5 h-12 animate-pulse rounded-xl bg-muted/40" />)
    : p[k].filter(pass).length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{tr("No token found")}</p>
    : p[k].filter(pass).map((t) => <Row key={t.mint} t={t} onOpen={onOpen} />);
  return (
    <div className="mt-3">
      {/* Une colonne à la fois (la liste du Terminal est étroite, même sur ordinateur) */}
      <div className="flex gap-1 rounded-xl bg-muted p-1">
        {cols.map(([k, label]) => <button key={k} onClick={() => setCol(k)} className={`flex-1 rounded-lg py-2 text-[13px] font-semibold ${col === k ? "bg-background text-foreground" : "text-muted-foreground"}`}>{label}</button>)}
      </div>
      <div className="mt-2">{list(col)}</div>
    </div>
  );
}
