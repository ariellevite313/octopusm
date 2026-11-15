/**
 * DSOL-20 : tokens lancés sur OMdotfun (Solana, Meteora) avec le DOGE officiel sur Solana comme monnaie de paire
 * (DOGE arrivé par Wormhole NTT, projet Sunrise : token SPL standard, 8 décimales, sans pouvoir de gel).
 * Leurs adresses commencent par « DoGE » (clés pré-générées, voir scripts/import-vanity-keys.mjs).
 */
export const DOGE_MINT = "DoGEV7LASBkQbibMc5k5vKnTZoMg423GpJ5QtJEGfm7R";
export const DOGE_DECIMALS = 8;
export const DSOL_PREFIX = "DoGE";
export const DSOL_LABEL = "DSOL-20";

/** Lancement en DOGE activé côté site (affiche le choix dans le formulaire). */
export const DOGE_LAUNCH_ENABLED = process.env.NEXT_PUBLIC_DOGE_LAUNCH === "1";

import { pairQuoteByMint } from "./quotes";

export const isDogeQuote = (quoteAsset: string | null | undefined) => quoteAsset === DOGE_MINT;

/** Monnaie de paire d'un token Solana d'OM pour l'écran d'achat : xStock, DOGE, PEPE, CLT ou SOL (null). */
export function quoteOf(t: { stock_symbol?: string | null; quote_asset?: string | null }, xStockMint: (s: string) => string | null) {
  if (t.stock_symbol) return { symbol: t.stock_symbol, mint: xStockMint(t.stock_symbol) ?? undefined, decimals: undefined as number | undefined };
  if (isDogeQuote(t.quote_asset)) return { symbol: "DOGE", mint: DOGE_MINT, decimals: DOGE_DECIMALS };
  const pq = pairQuoteByMint(t.quote_asset);
  if (pq) return { symbol: pq.symbol, mint: pq.mint, decimals: pq.decimals };
  return null;
}
