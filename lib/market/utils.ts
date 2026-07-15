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
