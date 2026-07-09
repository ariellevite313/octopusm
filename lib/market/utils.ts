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
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (o): o is MarketOption =>
      typeof o === "object" &&
      o !== null &&
      "id" in o &&
      "label" in o &&
      "oddsMultiplier" in o
  );
}
