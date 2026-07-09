"use client";

import type { ChartPoint, ChartRange, OctopusTokenBoardItem } from "./launch-data";
import { OFFICIAL_TOKEN_ADDRESS } from "./launch-data";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getPriceFractionDigits(v: number) {
  if (v < 0.0001) return 8;
  if (v < 0.01) return 6;
  if (v < 1) return 5;
  return 4;
}

export function formatUsd(
  value: string | number | null | undefined,
  mode: "price" | "market" = "market"
): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: mode === "market" && n >= 10_000 ? "compact" : "standard",
    minimumFractionDigits: mode === "price" ? getPriceFractionDigits(n) : 2,
    maximumFractionDigits: mode === "price" ? getPriceFractionDigits(n) : 2,
  }).format(n);
}

export function formatChartLabel(ts: number, range: ChartRange): string {
  return new Intl.DateTimeFormat(
    "en-US",
    range === "7D" ? { month: "short", day: "numeric" } : { hour: "2-digit", minute: "2-digit" }
  ).format(new Date(ts * 1000));
}

export function createFallbackChartPoints(
  basePrice: number,
  range: ChartRange = "24H"
): ChartPoint[] {
  const safePrice = basePrice > 0 ? basePrice : 1;
  const cfg =
    range === "1H"
      ? { points: 12, stepSeconds: 300 }
      : range === "6H"
        ? { points: 24, stepSeconds: 900 }
        : range === "7D"
          ? { points: 28, stepSeconds: 21600 }
          : { points: 24, stepSeconds: 3600 };

  return Array.from({ length: cfg.points }, (_, i) => {
    const timestamp = Math.floor(Date.now() / 1000) - (cfg.points - 1 - i) * cfg.stepSeconds;
    const wave = Math.sin(i / 2.6) * 0.035;
    const drift = (i - 12) * 0.0018;
    const close = Number((safePrice * (1 + wave + drift)).toFixed(6));
    return {
      timestamp,
      label: formatChartLabel(timestamp, range),
      close,
      high: Number((close * 1.012).toFixed(6)),
      low: Number((close * 0.988).toFixed(6)),
      volume: Number((safePrice * 12000 * (1 + i / 12)).toFixed(2)),
    };
  });
}

function parseFormattedUsd(v: string | null | undefined): number {
  if (!v) return 0;
  const n = Number(v.replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// DexScreener fetchers
// ---------------------------------------------------------------------------
async function fetchDexPair(pairAddress: string) {
  const res = await fetch(
    `https://api.dexscreener.com/latest/dex/pairs/solana/${pairAddress}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error("dexscreener-pair-failed");
  return res.json();
}

async function fetchDexToken(contractAddress: string) {
  const res = await fetch(
    `https://api.dexscreener.com/tokens/v1/solana/${contractAddress}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error("dexscreener-token-failed");
  return res.json();
}

function deepFind(payload: unknown, keys: string[]): string | number | null {
  if (!payload || typeof payload !== "object") return null;
  const norm = new Set(keys.map((k) => k.toLowerCase().replace(/[^a-z0-9]/g, "")));
  const visited = new WeakSet<object>();

  const search = (v: unknown): string | number | null => {
    if (!v || typeof v !== "object") return null;
    if (visited.has(v)) return null;
    visited.add(v);
    if (Array.isArray(v)) {
      for (const item of v) {
        const r = search(item);
        if (r !== null) return r;
      }
      return null;
    }
    const rec = v as Record<string, unknown>;
    for (const [key, val] of Object.entries(rec)) {
      const nk = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (norm.has(nk) && (typeof val === "string" || typeof val === "number")) {
        return val as string | number;
      }
      const r = search(val);
      if (r !== null) return r;
    }
    return null;
  };
  return search(payload);
}

// Build chart points from a DexScreener pair response
function extractChartPoints(pairPayload: unknown, range: ChartRange): ChartPoint[] | null {
  if (!pairPayload || typeof pairPayload !== "object") return null;
  const rec = pairPayload as Record<string, unknown>;
  const pairs = Array.isArray(rec["pairs"]) ? rec["pairs"] : (rec["pair"] ? [rec["pair"]] : []);
  if (!pairs.length) return null;

  const pair = pairs[0] as Record<string, unknown>;
  const price = Number(deepFind(pair, ["priceUsd", "price", "priceNative"]));
  if (!Number.isFinite(price) || price <= 0) return null;
  return createFallbackChartPoints(price, range);
}

// ---------------------------------------------------------------------------
// Main: fetch live snapshot for a token
// ---------------------------------------------------------------------------
export async function fetchLiveTokenMetrics(
  token: OctopusTokenBoardItem,
  range: ChartRange = "24H"
): Promise<Partial<OctopusTokenBoardItem> | null> {
  const isOfficial =
    token.contractAddress === OFFICIAL_TOKEN_ADDRESS || token.id === "clawdtrust";

  try {
    let pairPayload: unknown = null;
    let tokenPayload: unknown = null;

    if (isOfficial && token.poolAddress) {
      pairPayload = await fetchDexPair(token.poolAddress);
    } else if (token.contractAddress) {
      tokenPayload = await fetchDexToken(token.contractAddress);
    }

    const dataSource = pairPayload ?? tokenPayload;
    const priceRaw = deepFind(dataSource, ["priceUsd", "price"]);
    const priceValue = Number(priceRaw);
    const volume = deepFind(dataSource, ["volume24h", "volumeUsd24h", "volume"]);
    const marketCap = deepFind(dataSource, ["marketCap", "fdv", "fullyDilutedValuation"]);

    const chartPoints =
      pairPayload
        ? extractChartPoints(pairPayload, range) ??
          createFallbackChartPoints(priceValue || 1, range)
        : token.chartPoints ?? createFallbackChartPoints(priceValue || 1, range);

    return {
      price: formatUsd(priceValue, "price") || token.price,
      volume24h: formatUsd(volume, "market") || token.volume24h,
      marketCap: formatUsd(marketCap, "market") || token.marketCap,
      status: "Live",
      chartPoints,
      lastUpdatedLabel: new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date()),
    };
  } catch {
    return null;
  }
}

export { parseFormattedUsd };
