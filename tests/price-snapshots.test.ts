import { describe, it, expect } from "vitest";
import BN from "bn.js";
import { snapshotsToBars, snapshotsToPoints, keepLastKnown } from "@/lib/launch/price-snapshots";
import { priceUsdFromSqrt } from "@/lib/launch/onchain-price";

describe("snapshotsToBars", () => {
  it("regroupe par tranche et relie les bougies sans trou", () => {
    const bars = snapshotsToBars([{ t: 1000, p: 1 }, { t: 1100, p: 3 }, { t: 1150, p: 2 }, { t: 1400, p: 4 }], 300);
    expect(bars).toEqual([
      { time: 900, open: 1, high: 3, low: 1, close: 2 },
      { time: 1200, open: 2, high: 4, low: 2, close: 4 },
    ]);
  });
  it("ignore les prix invalides et trie", () => {
    expect(snapshotsToBars([{ t: 5, p: 0 }, { t: 2, p: NaN }])).toEqual([]);
    expect(snapshotsToPoints([{ t: 3, p: 3 }, { t: 1, p: 1 }, { t: 2, p: 2 }])).toEqual([1, 2, 3]);
  });
});

describe("keepLastKnown", () => {
  it("n'écrase pas par du vide", () => {
    expect(keepLastKnown({ a: null, b: 0, c: 5, d: undefined, e: NaN })).toEqual({ b: 0, c: 5 });
  });
});

describe("priceUsdFromSqrt", () => {
  it("retrouve le prix à partir du sqrtPrice (tokens 6 décimales, SOL 9)", async () => {
    // 0,000001 SOL par token ; SOL à 200 $ → 0,0002 $
    const solPerToken = 1e-6;
    const sqrt = Math.sqrt(solPerToken * 10 ** (9 - 6)) * 2 ** 64;
    const usd = await priceUsdFromSqrt(new BN(BigInt(Math.round(sqrt)).toString()), 200);
    expect(usd).toBeCloseTo(0.0002, 7);
  });
});
