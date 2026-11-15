import { describe, it, expect } from "vitest";
import { DOGE_MINT, DSOL_PREFIX, isDogeQuote, quoteOf } from "@/lib/solana/doge";

describe("DSOL-20 (paire DOGE sur Solana)", () => {
  const x = (s: string) => (s === "xNVDA" ? "XNVDAmint" : null);
  it("un token en SOL reste en SOL (rien ne change pour les lancements existants)", () => {
    expect(quoteOf({ stock_symbol: null, quote_asset: null }, x)).toBeNull();
  });
  it("un token xStock garde sa paire xStock", () => {
    expect(quoteOf({ stock_symbol: "xNVDA", quote_asset: "XNVDAmint" }, x)).toEqual({ symbol: "xNVDA", mint: "XNVDAmint", decimals: undefined });
  });
  it("un token DSOL-20 se trade en DOGE (8 décimales)", () => {
    expect(quoteOf({ stock_symbol: null, quote_asset: DOGE_MINT }, x)).toEqual({ symbol: "DOGE", mint: DOGE_MINT, decimals: 8 });
    expect(isDogeQuote(DOGE_MINT)).toBe(true);
    expect(DSOL_PREFIX).toBe("DoGE");
  });
});
