/**
 * xStocks Solana integration — catalogue and mint addresses.
 *
 * Mint addresses are hardcoded — read from Terminal (pump.fun)'s production
 * JS bundle on 9 September 2026. These are the real Token-2022 mints issued
 * by Backed Finance on Solana mainnet.
 *
 * DBC configs are created on-the-fly per pool via `createConfigAndPoolWithFirstBuy`
 * (see lib/solana/dbc.ts) — no pre-created env vars needed.
 */

/** On-chain SPL (Token-2022) mint addresses — Solana mainnet */
export const XSTOCK_MINTS: Record<string, string> = {
  xNVDA: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
  xTSLA: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
  xMSTR: "XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ",
  xAAPL: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
  xSPY:  "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
  xQQQ:  "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ",
  xGLD:  "Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re",
};

export const XSTOCK_CATALOG_SOLANA = [
  { symbol: "xNVDA", name: "Nvidia",        ticker: "NVDA", emoji: "🟢" },
  { symbol: "xTSLA", name: "Tesla",         ticker: "TSLA", emoji: "⚡" },
  { symbol: "xMSTR", name: "MicroStrategy", ticker: "MSTR", emoji: "🟠" },
  { symbol: "xAAPL", name: "Apple",         ticker: "AAPL", emoji: "🍎" },
  { symbol: "xSPY",  name: "S&P 500 ETF",  ticker: "SPY",  emoji: "📈" },
  { symbol: "xQQQ",  name: "Nasdaq 100",   ticker: "QQQ",  emoji: "📊" },
  { symbol: "xGLD",  name: "Gold",          ticker: "GLD",  emoji: "🥇" },
] as const;

/**
 * Logo paths (in /public) for each xStock symbol.
 * Null = pas de logo disponible → fallback sur l'emoji.
 */
export const XSTOCK_LOGOS: Record<string, string | null> = {
  xNVDA: "/nvidia.png",
  xTSLA: "/tesla.png",
  xMSTR: null,
  xAAPL: "/apple.png",
  xSPY:  "/spy.png",
  xQQQ:  "/qqq.png",
  xGLD:  "/gold.png",
};

export type XStockSymbol = typeof XSTOCK_CATALOG_SOLANA[number]["symbol"];

/**
 * Returns the SPL Token-2022 mint address for a given xStock symbol (hardcoded from mainnet).
 * Returns null if the symbol is not found.
 */
export function getXStockMint(symbol: string): string | null {
  return XSTOCK_MINTS[symbol] ?? null;
}

/** Returns true if the symbol is a known xStock. */
export function isXStock(symbol: string): boolean {
  return symbol in XSTOCK_MINTS;
}
