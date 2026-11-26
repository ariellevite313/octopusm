"use client";

/**
 * Style Pump.fun : le graphique vibre et s'éclaire en vert à chaque achat sur le token affiché.
 * Écoute les trades en direct (PumpPortal sur Solana) et ceux du fil « Trades » (événement om-token-trade).
 */
import { useEffect, useRef, useState } from "react";
import { onTokenTrade } from "@/lib/pumpportal";

export const TOKEN_TRADE = "om-token-trade";
export type TokenTradeEvent = { mint: string; side: "buy" | "sell" };

export function ChartShake({ mint, chain, children, className = "" }: { mint: string; chain: string; children: React.ReactNode; className?: string }) {
  const [on, setOn] = useState(false);
  const last = useRef(0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const fire = () => {
      const now = Date.now();
      if (now - last.current < 350) return; // pas plus de ~3 secousses par seconde
      last.current = now;
      timers.current.forEach((t) => { cancelAnimationFrame(t); clearTimeout(t); });
      setOn(false);
      const r1 = requestAnimationFrame(() => { const r2 = requestAnimationFrame(() => setOn(true)); timers.current.push(r2); });
      const t = window.setTimeout(() => setOn(false), 900);
      timers.current = [r1, t];
    };
    const onEvt = (e: Event) => { const d = (e as CustomEvent<TokenTradeEvent>).detail; if (d?.mint === mint && d.side === "buy") fire(); };
    window.addEventListener(TOKEN_TRADE, onEvt);
    const off = chain === "solana" ? onTokenTrade(mint, (m) => { if (m.txType === "buy" && m.tokenAmount > 0) fire(); }) : undefined;
    return () => { window.removeEventListener(TOKEN_TRADE, onEvt); off?.(); timers.current.forEach((t) => { cancelAnimationFrame(t); clearTimeout(t); }); };
  }, [mint, chain]);

  return <div className={`${on ? "pf-chart-buy" : ""} ${className}`}>{children}</div>;
}
