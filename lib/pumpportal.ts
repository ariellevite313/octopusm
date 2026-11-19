"use client";
/**
 * Flux temps réel gratuit de PumpPortal (pump.fun, PumpSwap, LetsBonk) : nouveaux tokens et trades d'un token.
 * Une seule connexion WebSocket par onglet, partagée par Pulse et le fil des trades. Reconnexion automatique.
 */

export type PpCreate = {
  mint: string; name: string; symbol: string; uri: string; marketCapSol: number; bondingCurveKey: string;
  traderPublicKey: string; signature: string; pool?: string;
};
export type PpTrade = {
  mint: string; signature: string; traderPublicKey: string; txType: "buy" | "sell";
  tokenAmount: number; solAmount: number; marketCapSol: number; pool?: string;
};

type Listener<T> = (m: T) => void;
const URL_WS = "wss://pumpportal.fun/api/data";

let ws: WebSocket | null = null;
let retry = 0;
const createSubs = new Set<Listener<PpCreate>>();
const tradeSubs = new Map<string, Set<Listener<PpTrade>>>();

function send(o: unknown) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o)); }

function idle() { return createSubs.size === 0 && tradeSubs.size === 0; }

function connect() {
  if (typeof window === "undefined" || ws || idle()) return;
  try { ws = new WebSocket(URL_WS); } catch { ws = null; return; }
  ws.onopen = () => {
    retry = 0;
    if (createSubs.size) send({ method: "subscribeNewToken" });
    if (tradeSubs.size) send({ method: "subscribeTokenTrade", keys: [...tradeSubs.keys()] });
  };
  ws.onmessage = (e) => {
    let m: Record<string, unknown>;
    try { m = JSON.parse(String(e.data)); } catch { return; }
    if (typeof m.mint !== "string") return;
    if (m.txType === "create") { createSubs.forEach((f) => f(m as unknown as PpCreate)); return; }
    if (m.txType === "buy" || m.txType === "sell") tradeSubs.get(m.mint)?.forEach((f) => f(m as unknown as PpTrade));
  };
  ws.onclose = () => {
    ws = null;
    if (idle()) return;
    retry = Math.min(retry + 1, 6);
    setTimeout(connect, 1000 * 2 ** retry);
  };
  ws.onerror = () => { try { ws?.close(); } catch { /* ignore */ } };
}

function maybeClose() { if (idle() && ws) { const w = ws; ws = null; try { w.close(); } catch { /* ignore */ } } }

/** Nouveaux tokens en temps réel. Renvoie la fonction de désinscription. */
export function onNewToken(f: Listener<PpCreate>): () => void {
  const first = createSubs.size === 0;
  createSubs.add(f);
  if (ws) { if (first) send({ method: "subscribeNewToken" }); } else connect();
  return () => {
    createSubs.delete(f);
    if (createSubs.size === 0) send({ method: "unsubscribeNewToken" });
    maybeClose();
  };
}

/** Trades d'un token en temps réel (tokens pump.fun / PumpSwap / LetsBonk). */
export function onTokenTrade(mint: string, f: Listener<PpTrade>): () => void {
  let set = tradeSubs.get(mint);
  if (!set) { set = new Set(); tradeSubs.set(mint, set); if (ws) send({ method: "subscribeTokenTrade", keys: [mint] }); }
  set.add(f);
  if (!ws) connect();
  return () => {
    const s = tradeSubs.get(mint);
    s?.delete(f);
    if (s && s.size === 0) { tradeSubs.delete(mint); send({ method: "unsubscribeTokenTrade", keys: [mint] }); }
    maybeClose();
  };
}

/** Prix du SOL en dollars (Binance), gardé une minute. */
let solCache: { at: number; v: number } | null = null;
export async function solUsd(): Promise<number | null> {
  if (solCache && Date.now() - solCache.at < 60_000) return solCache.v;
  try {
    const r = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT");
    const v = Number(((await r.json()) as { price?: string }).price);
    if (v > 0) { solCache = { at: Date.now(), v }; return v; }
  } catch { /* ignore */ }
  return solCache?.v ?? null;
}
