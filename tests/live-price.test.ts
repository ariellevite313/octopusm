import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveQuote, dexAllowed } from "@/lib/social/live-price";

const dexPair = (symbol: string) => ({ pairs: [{ chainId: "solana", pairAddress: "P1", baseToken: { symbol, name: symbol }, priceUsd: "0.5", priceChange: { h24: 1 }, liquidity: { usd: 500_000 } }] });

function mockFetch(opts: { binance?: boolean; dex?: unknown }) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(String(url));
    if (String(url).includes("binance")) return opts.binance ? { ok: true, json: async () => ({ lastPrice: "100", priceChangePercent: "2" }) } : { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => opts.dex ?? { pairs: [] } };
  }));
  return calls;
}

beforeEach(() => vi.unstubAllGlobals());

describe("prix d'un $TICKER hors OMdotfun", () => {
  it("une grande crypto cotée sur Binance affiche son prix", async () => {
    mockFetch({ binance: true });
    const q = await resolveQuote("$ZZBTCA");
    expect(q?.kind).toBe("cex");
  });

  it("un symbole inconnu n'est jamais cherché sur un DEX : aucune carte", async () => {
    const calls = mockFetch({ binance: false, dex: dexPair("FAKECOIN") });
    const q = await resolveQuote("$FAKECOIN");
    expect(q).toBeNull();
    expect(calls.some((c) => c.includes("dexscreener"))).toBe(false);
  });

  it("un symbole de la liste connue (ex. BONK) peut être trouvé sur un DEX", async () => {
    mockFetch({ binance: false, dex: dexPair("BONK") });
    const q = await resolveQuote("$BONK");
    expect(q?.kind).toBe("dex");
    expect(dexAllowed("bonk")).toBe(true);
    expect(dexAllowed("FAKECOIN")).toBe(false);
  });

  it("l'outil admin peut encore chercher n'importe quel token (anyDex)", async () => {
    mockFetch({ binance: false, dex: dexPair("ADMINCOIN") });
    const q = await resolveQuote("$ADMINCOIN", { anyDex: true });
    expect(q?.kind).toBe("dex");
  });

  it("les stablecoins n'ont pas de carte", async () => {
    mockFetch({ binance: true });
    expect(await resolveQuote("$USDT")).toBeNull();
  });
});
