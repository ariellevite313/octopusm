"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/providers/auth-provider";
import { TrackedWallets } from "./tracked-wallets";

type Pos = { mint: string; chain: "solana" | "arc"; symbol: string; logo: string | null; open: boolean; value: number; pnl: number; pct: number; bought: number };
const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n) >= 1e6 ? `${(Math.abs(n) / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e3 ? `${(Math.abs(n) / 1e3).toFixed(1)}K` : Math.abs(n).toFixed(2)}`;

/** Mes positions : tokens tradés via OM, valeur actuelle et gain réalisé + latent. Rafraîchi toutes les 30 s. */
export function Positions({ onOpen }: { onOpen: (mint: string, chain: "solana" | "arc") => void }) {
  const { tr } = useT();
  const { isAuthenticated, walletAddress } = useAuth();
  const [rows, setRows] = useState<Pos[] | null>(null);
  useEffect(() => {
    if (!isAuthenticated) { setRows([]); return; }
    let off = false;
    const load = () => { if (document.visibilityState === "visible") fetch("/api/terminal/positions").then((r) => r.json()).then((j) => { if (!off) setRows(j.positions ?? []); }).catch(() => { if (!off) setRows((r) => r ?? []); }); };
    load();
    const every = setInterval(load, 30_000);
    return () => { off = true; clearInterval(every); };
  }, [isAuthenticated, walletAddress]);

  if (!isAuthenticated) return (
    <button onClick={() => window.dispatchEvent(new CustomEvent("open-wallet-connect"))} className="mt-4 h-12 w-full rounded-2xl bg-foreground text-[15px] font-bold text-background">{tr("Connect")}</button>
  );
  if (!rows) return <div className="mt-2">{Array.from({ length: 4 }, (_, i) => <div key={i} className="my-2 h-14 animate-pulse rounded-2xl bg-muted/40" />)}</div>;
  if (!rows.length) return <><p className="py-12 text-center text-sm text-muted-foreground">{tr("Your trades made on OM will show here.")}</p>{!walletAddress?.startsWith("0x") && <TrackedWallets />}</>;
  const total = rows.reduce((s, r) => s + r.pnl, 0);
  return (
    <div className="mt-2">
      <p className="px-1 pb-1 text-[13px] text-muted-foreground">{tr("Total P&L")} <span className={`num font-bold ${total >= 0 ? "text-up" : "text-down"}`}>{total >= 0 ? "+" : ""}{usd(total)}</span></p>
      {rows.map((p) => (
        <button key={p.mint} onClick={() => onOpen(p.mint, p.chain)} className="flex w-full items-center gap-3 rounded-2xl px-1 py-3 text-left hover:bg-muted/40">
          {p.logo
            ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.logo} alt="" className="size-11 shrink-0 rounded-full object-cover" />
            : <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-[13px] font-bold text-muted-foreground">{p.symbol.slice(0, 2).toUpperCase()}</span>}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[16px] font-bold text-foreground"><span className="truncate">{p.symbol}</span>
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{tr(p.open ? "Open" : "Closed")}</span></p>
            <p className="num text-[13px] text-muted-foreground">{tr("Held")} {usd(p.value)} · {tr("Invested")} {usd(p.bought)}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className={`num text-[16px] font-bold ${p.pnl >= 0 ? "text-up" : "text-down"}`}>{p.pnl >= 0 ? "+" : ""}{usd(p.pnl)}</p>
            <p className={`num text-[12px] ${p.pct >= 0 ? "text-up" : "text-down"}`}>{p.pct >= 0 ? "+" : ""}{p.pct.toFixed(1)}%</p>
          </div>
        </button>
      ))}
      {!walletAddress?.startsWith("0x") && <TrackedWallets />}
    </div>
  );
}
