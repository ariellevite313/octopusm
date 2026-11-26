"use client";

/**
 * Style Pump.fun : à chaque achat sur le token affiché, la dernière bougie du graphique vibre et s'éclaire en vert
 * (sur une courbe, c'est le point au bout de la ligne). Le reste du graphique ne bouge pas.
 * Écoute les trades en direct (PumpPortal sur Solana) et ceux du fil « Trades » (événement om-token-trade).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { onTokenTrade } from "@/lib/pumpportal";

export const TOKEN_TRADE = "om-token-trade";
export type TokenTradeEvent = { mint: string; side: "buy" | "sell" };

/** Appelle `fire` à chaque achat sur `mint` (au plus ~3 fois par seconde). */
export function useBuyPulse(mint: string | null | undefined, chain: string | null | undefined, fire: () => void) {
  const cb = useRef(fire);
  cb.current = fire;
  useEffect(() => {
    if (!mint) return;
    let last = 0;
    const go = () => { const now = Date.now(); if (now - last < 350) return; last = now; cb.current(); };
    const onEvt = (e: Event) => { const d = (e as CustomEvent<TokenTradeEvent>).detail; if (d?.mint === mint && d.side === "buy") go(); };
    window.addEventListener(TOKEN_TRADE, onEvt);
    const off = chain === "solana" ? onTokenTrade(mint, (m) => { if (m.txType === "buy" && m.tokenAmount > 0) go(); }) : undefined;
    return () => { window.removeEventListener(TOKEN_TRADE, onEvt); off?.(); };
  }, [mint, chain]);
}

type Candle = { time: unknown; open: number; high: number; low: number; close: number };
export type CandleGeom = { x: number; w: number; hi: number; lo: number; top: number; bottom: number; up: boolean; n: number };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Api = { chart: any; series: any } | null;

const CLEAR = "rgba(0,0,0,0)";

/**
 * Dernière bougie qui vibre : on la masque un instant dans le graphique et on dessine à sa place une copie qui secoue.
 * `getApi` donne le graphique lightweight-charts et sa série de bougies.
 */
export function useCandlePulse(mint: string | null | undefined, chain: string | null | undefined, getApi: () => Api) {
  const [g, setG] = useState<CandleGeom | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const n = useRef(0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastBar = (series: any): Candle | null => {
    try { const d = series.data() as Candle[]; const b = d[d.length - 1]; return b && typeof b.open === "number" ? b : null; } catch { return null; }
  };
  const restore = useCallback(() => {
    const api = getApi();
    if (!api) return;
    const b = lastBar(api.series);
    if (b) try { api.series.update({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }); } catch { /* retiré */ }
  }, [getApi]);

  useBuyPulse(mint, chain, () => {
    const api = getApi();
    if (!api) return;
    const b = lastBar(api.series);
    if (!b) return;
    try {
      const ts = api.chart.timeScale();
      const x = ts.timeToCoordinate(b.time), hi = api.series.priceToCoordinate(b.high), lo = api.series.priceToCoordinate(b.low);
      const o = api.series.priceToCoordinate(b.open), c = api.series.priceToCoordinate(b.close);
      if ([x, hi, lo, o, c].some((v) => v == null)) return;
      const w = Math.max(3, Math.min(24, (ts.options().barSpacing ?? 6) * 0.8));
      if (timer.current) clearTimeout(timer.current); else api.series.update({ ...b, color: CLEAR, wickColor: CLEAR, borderColor: CLEAR });
      n.current += 1;
      setG({ x, w, hi, lo, top: Math.min(o, c), bottom: Math.max(o, c), up: b.close >= b.open, n: n.current });
      timer.current = setTimeout(() => { timer.current = null; restore(); setG(null); }, 900);
    } catch { /* graphique retiré */ }
  });

  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); restore(); } }, [restore]);
  return g;
}

/** Copie de la dernière bougie qui secoue (à placer dans le conteneur `relative` du graphique). */
export function CandlePulse({ g }: { g: CandleGeom | null }) {
  if (!g) return null;
  const color = g.up ? "#22c55e" : "#ef4444";
  return (
    <span key={g.n} aria-hidden className="pf-candle pointer-events-none absolute z-[6]"
      style={{ left: g.x - g.w / 2, top: g.hi, width: g.w, height: Math.max(2, g.lo - g.hi) }}>
      <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2" style={{ background: color }} />
      <span className="absolute inset-x-0 rounded-[1px]" style={{ top: g.top - g.hi, height: Math.max(2, g.bottom - g.top), background: color }} />
    </span>
  );
}
