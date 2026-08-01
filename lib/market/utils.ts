/**
 * Market utilities — no server imports (usable client-side and server-side).
 */

export type MarketOption = {
  id: string;
  label: string;
  oddsMultiplier: number;
  logoSrc?: string;
  description?: string;
};

export type MarketVolumes = Record<string, { usdc: number; clt: number }>;

/**
 * Affichage uniforme du volume sur toutes les cards.
 * USDC → "$1.2K USDC"   CLT → "1.2K CLT"
 */
export function formatVolume(amount: number, token: string = "usdc"): string {
  const isClt = token === "clawdtrust";
  const prefix = isClt ? "" : "$";
  const suffix = isClt ? " ClawdTrust" : " USDC";

  let compact: string;
  if (amount >= 1_000_000) compact = (amount / 1_000_000).toFixed(1) + "M";
  else if (amount >= 1_000) compact = (amount / 1_000).toFixed(1) + "K";
  else compact = amount.toFixed(0);

  return `${prefix}${compact}${suffix}`;
}

export function parseMarketOptions(raw: unknown): MarketOption[] {
  // Guard against double-serialization: DB stored a JSON string instead of a JSON array
  let data = raw;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch { return []; }
  }
  if (!Array.isArray(data)) return [];
  return data.filter(
    (o): o is MarketOption =>
      typeof o === "object" &&
      o !== null &&
      "id" in o &&
      "label" in o &&
      "oddsMultiplier" in o
  );
}
