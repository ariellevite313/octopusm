"use client";

/**
 * Activité : mes actions (ordres limités, swaps) et celles de mon Janus (actions du wallet IA, sorties automatiques).
 * compact : sous le formulaire limite (8 lignes, une ligne par action sans débordement, bouton « Tout voir » qui ouvre
 * la page complète dans une autre fenêtre). Page complète : filtres par auteur, par date et par token. 90 dernières entrées.
 */
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Maximize2, RefreshCw } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/providers/auth-provider";
import { JanusBadgeIcon } from "@/components/janus/janus-icon";
import { Mirage } from "@/components/shared/mirage";
import type { ActivityItem } from "@/lib/activity";

type Who = "all" | "you" | "janus";
const money = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(2)}`);
const when = (iso: string, full: boolean) => {
  const d = new Date(iso);
  return full ? d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
};
const STATUS: Record<string, string> = { done: "text-up", open: "text-foreground", pending: "text-muted-foreground", closed: "text-muted-foreground", failed: "text-down", cancelled: "text-muted-foreground" };

function Row({ a, full }: { a: ActivityItem; full: boolean }) {
  const { tr } = useT();
  const tx = a.tx && /^[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(a.tx) ? `https://solscan.io/tx/${a.tx}` : a.tx && /^0x[0-9a-fA-F]{64}$/.test(a.tx) ? null : null;
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-border py-2 text-[12.5px] last:border-0">
      <span className={`flex shrink-0 items-center gap-1.5 ${full ? "w-[120px]" : "w-[58px]"}`}>
        {a.who === "janus" ? <JanusBadgeIcon size={16} /> : <span className="size-4 shrink-0 rounded-full bg-foreground" />}
        <span className="num truncate text-muted-foreground">{when(a.at, full)}</span>
      </span>
      <span className="min-w-0">
        <span className={`block truncate font-semibold ${a.side === "buy" ? "text-up" : a.side === "sell" ? "text-down" : "text-foreground"}`} title={a.label}>
          {a.who === "janus" ? "Janus · " : ""}{a.label}
        </span>
        {(full || a.error) && (
          <span className="block truncate text-[11px] text-muted-foreground" title={a.error ?? undefined}>
            {a.error ? `${tr("Why")}: ${a.error}` : a.mint ? `${a.mint.slice(0, 4)}…${a.mint.slice(-4)}` : ""}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-2 text-right">
        {a.usd != null && <span className="num font-semibold">{money(a.usd)}</span>}
        <span className={`text-[11px] font-bold uppercase ${STATUS[a.status] ?? "text-muted-foreground"}`}>{tr(a.status)}</span>
        {tx && <a href={tx} target="_blank" rel="noopener noreferrer" aria-label="Solscan" className="text-muted-foreground hover:text-foreground"><ExternalLink className="size-3.5" /></a>}
      </span>
    </div>
  );
}

/** bare : sans cadre (posé dans une colonne étroite, sous le formulaire limite) */
export function ActivityList({ mint = null, compact = false, bare = false }: { mint?: string | null; compact?: boolean; bare?: boolean }) {
  const { tr } = useT();
  const { isAuthenticated } = useAuth();
  const [who, setWho] = useState<Who>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [token, setToken] = useState(mint ?? "");
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const load = useCallback(() => {
    if (!isAuthenticated) { setItems([]); return; }
    const p = new URLSearchParams({ who, limit: compact ? "8" : "90" });
    const m = (compact ? mint : token.trim()) || "";
    if (m) p.set("mint", m);
    if (!compact && from) p.set("from", from);
    if (!compact && to) p.set("to", to);
    fetch(`/api/terminal/activity?${p}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : { items: [] })).then((j) => setItems(j.items ?? [])).catch(() => setItems([]));
  }, [isAuthenticated, who, compact, mint, token, from, to]);
  useEffect(() => { setItems(null); load(); const id = setInterval(load, 30_000); return () => clearInterval(id); }, [load]);

  const openAll = () => window.open(`/activity${mint ? `?mint=${encodeURIComponent(mint)}` : ""}`, "_blank", "noopener");
  const tabs: [Who, string][] = [["all", tr("All")], ["you", tr("You")], ["janus", "Janus"]];

  return (
    <div className={compact && !bare ? "rounded-2xl border border-border p-4" : ""}>
      <div className="flex items-center gap-2">
        <p className="text-[14px] font-bold">{compact ? tr("Activity") : null}</p>
        <button onClick={load} aria-label={tr("Refresh")} className="ml-auto text-muted-foreground hover:text-foreground"><RefreshCw className="size-3.5" /></button>
        {compact && <button onClick={openAll} title={tr("Open all activity in a new window")} aria-label={tr("Open all activity in a new window")} className="text-muted-foreground hover:text-foreground"><Maximize2 className="size-3.5" /></button>}
      </div>
      <div className="mt-1.5 flex gap-1">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setWho(k)} className={`rounded-lg px-2.5 py-1 text-[12px] font-semibold ${who === k ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>
        ))}
      </div>
      {!compact && (
        <div className="mt-3 flex flex-wrap items-end gap-2 text-[12px]">
          <label className="flex flex-col gap-1 font-semibold text-muted-foreground">{tr("From")}<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-foreground" /></label>
          <label className="flex flex-col gap-1 font-semibold text-muted-foreground">{tr("To")}<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-foreground" /></label>
          <label className="flex min-w-[220px] flex-1 flex-col gap-1 font-semibold text-muted-foreground">{tr("Token address")}<input value={token} onChange={(e) => setToken(e.target.value)} placeholder={tr("All tokens")} className="h-9 rounded-lg border border-border bg-background px-2 font-mono text-foreground" /></label>
          {(from || to || token) && <button onClick={() => { setFrom(""); setTo(""); setToken(""); }} className="h-9 rounded-lg border border-border px-3 font-semibold">{tr("Clear")}</button>}
        </div>
      )}
      <div className="mt-2">
        {!isAuthenticated ? <p className="py-4 text-center text-[12px] text-muted-foreground">{tr("Connect to see your activity")}</p>
          : items === null ? <div className="flex justify-center py-5"><Mirage className="size-4" /></div>
          : items.length === 0 ? <p className="py-4 text-center text-[12px] text-muted-foreground">{tr("No activity yet")}</p>
          : items.map((a, i) => <Row key={`${a.at}${i}`} a={a} full={!compact} />)}
      </div>
      {!compact && <p className="mt-3 text-[11px] text-muted-foreground">{tr("The 90 most recent entries are shown.")}</p>}
    </div>
  );
}
