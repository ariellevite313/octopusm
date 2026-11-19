"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useT } from "@/lib/i18n";
import { EVM_CHAINS, isEvmChain } from "@/lib/swap/evm";
import { EXTRA_EXPLORERS, GT_NET, type TerminalChain } from "@/lib/terminal";
import type { LiveTrade } from "@/app/api/terminal/live-trades/route";
import { onTokenTrade, solUsd } from "@/lib/pumpportal";

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const usd = (n: number) => (n > 0 && n < 0.01 ? "<$0.01" : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(n < 10 ? 2 : 0)}`);
const qty = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toLocaleString("en-US", { maximumFractionDigits: 2 }));
function ago(t: number): string {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
}

/** Fil des trades en direct d'un token (tous les wallets), rafraîchi toutes les 5 secondes quand la page est visible. */
export function LiveTrades({ chain, pool, mint }: { chain: TerminalChain; pool: string; mint: string }) {
  const { tr } = useT();
  const [rows, setRows] = useState<LiveTrade[] | null>(null);
  const [side, setSide] = useState<"all" | "buy" | "sell">("all");
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string>>(new Set());
  const [, tick] = useState(0);
  const network = GT_NET[chain];

  useEffect(() => {
    if (!network) return;
    let off = false;
    seen.current = new Set();
    setRows(null);
    const load = () => {
      if (document.visibilityState !== "visible") return;
      fetch(`/api/terminal/live-trades?network=${network}${pool ? `&pool=${encodeURIComponent(pool)}` : ""}&mint=${encodeURIComponent(mint)}`)
        .then((r) => (r.ok ? r.json() : null)).then((j: { trades?: LiveTrade[] } | null) => {
          if (off || !j?.trades) { if (!off) setRows((r) => r ?? []); return; }
          const first = seen.current.size === 0;
          const added = new Set(j.trades.filter((x) => !seen.current.has(x.tx)).map((x) => x.tx));
          j.trades.forEach((x) => seen.current.add(x.tx));
          setRows((prev) => {
            const by = new Map((prev ?? []).map((x) => [x.tx, x]));
            for (const x of j.trades!) by.set(x.tx, x);
            return [...by.values()].sort((a, b) => b.t - a.t).slice(0, 120);
          });
          if (!first && added.size) { setFresh(added); setTimeout(() => !off && setFresh(new Set()), 1500); }
        }).catch(() => { if (!off) setRows((r) => r ?? []); });
    };
    load();
    const every = setInterval(load, 5000);
    const clock = setInterval(() => tick((n) => n + 1), 1000);
    return () => { off = true; clearInterval(every); clearInterval(clock); };
  }, [network, pool, mint]);

  // Solana : trades pump.fun / PumpSwap / LetsBonk à la seconde (PumpPortal), avant même que GeckoTerminal les voie
  useEffect(() => {
    if (chain !== "solana") return;
    let sol: number | null = null;
    solUsd().then((v) => { sol = v; });
    return onTokenTrade(mint, (m) => {
      if (seen.current.has(m.signature) || !(m.tokenAmount > 0)) return;
      seen.current.add(m.signature);
      const usdV = sol ? m.solAmount * sol : 0;
      const row: LiveTrade = { tx: m.signature, wallet: m.traderPublicKey, side: m.txType, usd: usdV, amount: m.tokenAmount, price: usdV / m.tokenAmount, t: Date.now() };
      setRows((r) => [row, ...(r ?? [])].slice(0, 120));
      setFresh(new Set([m.signature]));
      setTimeout(() => setFresh(new Set()), 1500);
    });
  }, [chain, mint]);

  if (!network) return <p className="py-8 text-center text-sm text-muted-foreground">{tr("Live trades not available on this network yet.")}</p>;
  if (!rows) return <div className="space-y-2 py-2">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-muted" />)}</div>;

  const base = chain === "solana" ? "https://solscan.io" : isEvmChain(chain) ? EVM_CHAINS[chain].explorer : EXTRA_EXPLORERS[chain] ?? null;
  const list = rows.filter((r) => side === "all" || r.side === side);
  const buys = rows.filter((r) => r.side === "buy").reduce((s, r) => s + r.usd, 0);
  const sells = rows.filter((r) => r.side === "sell").reduce((s, r) => s + r.usd, 0);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 pb-2">
        <div className="flex overflow-hidden rounded-lg border border-border text-[12px] font-semibold">
          {(["all", "buy", "sell"] as const).map((k) => (
            <button key={k} onClick={() => setSide(k)} className={`px-2.5 py-1 ${side === k ? "bg-foreground text-background" : "text-muted-foreground"}`}>
              {k === "all" ? tr("All") : k === "buy" ? tr("Buys") : tr("Sells")}
            </button>
          ))}
        </div>
        <p className="num text-[12px] text-muted-foreground"><span className="text-up">{usd(buys)}</span> / <span className="text-down">{usd(sells)}</span></p>
      </div>
      <div className="grid grid-cols-[2.5rem_1fr_1fr_1fr_1.25rem] gap-2 border-b border-border pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <span>{tr("Age")}</span><span>{tr("Value")}</span><span className="text-right">{tr("Amount")}</span><span className="text-right">{tr("Trader")}</span><span />
      </div>
      {list.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{tr("No trades yet.")}</p>}
      {list.map((r) => (
        <div key={r.tx} className={`grid grid-cols-[2.5rem_1fr_1fr_1fr_1.25rem] items-center gap-2 border-b border-border/50 py-2 text-[13px] transition-colors duration-700 ${fresh.has(r.tx) ? (r.side === "buy" ? "bg-up/10" : "bg-down/10") : ""}`}>
          <span className="num text-muted-foreground">{ago(r.t)}</span>
          <span className={`num font-semibold ${r.side === "buy" ? "text-up" : "text-down"}`}>{r.side === "buy" ? "+" : "-"}{usd(r.usd)}</span>
          <span className="num text-right text-foreground">{qty(r.amount)}</span>
          {base ? <a href={`${base}/${chain === "solana" ? "account" : "address"}/${r.wallet}`} target="_blank" rel="noopener noreferrer" className="num truncate text-right text-foreground/80 hover:text-foreground">{short(r.wallet)}</a>
            : <span className="num truncate text-right text-foreground/80">{short(r.wallet)}</span>}
          {base ? <a href={`${base}/tx/${r.tx}`} target="_blank" rel="noopener noreferrer" aria-label={tr("Explorer")} className="text-muted-foreground hover:text-foreground"><ExternalLink className="size-3.5" /></a> : <span />}
        </div>
      ))}
    </div>
  );
}
