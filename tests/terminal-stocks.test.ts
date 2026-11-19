import { afterEach, describe, expect, it, vi } from "vitest";
import { stocksList } from "@/lib/terminal-stocks";

afterEach(() => vi.unstubAllGlobals());

describe("stocksList", () => {
  it("keeps only verified tokens from known issuers and cleans the names", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
      { id: "Xs1", symbol: "TSLAx", name: "Tesla xStock", isVerified: true, tags: ["xstocks", "verified"], usdPrice: 300, mcap: 1e6, liquidity: 5e5, stats24h: { priceChange: -2, buyVolume: 10, sellVolume: 5 } },
      { id: "Fake", symbol: "TSLAx", name: "Tesla xStock", isVerified: false, tags: ["unknown"], usdPrice: 1, mcap: 0 },
      { id: "On1", symbol: "TSLAon", name: "Tesla (Ondo Tokenized)", isVerified: true, tags: ["ondo", "verified"], usdPrice: 301, mcap: 2e5, liquidity: 1e5 },
    ]), { status: 200 })));
    const l = await stocksList("tsla-test");
    expect(l.map((t) => t.mint)).toEqual(["Xs1", "On1"]);
    expect(l[0]).toMatchObject({ name: "Tesla", issuer: "xStocks", volume24h: 15, change24h: -2, chain: "solana", verified: true });
    expect(l[1]).toMatchObject({ name: "Tesla", issuer: "Ondo" });
  });
});
