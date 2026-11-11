/** BAGS : tri par valeur, poussière repliée, lecture Solana (RPC et Jupiter simulés). */
import { describe, it, expect, vi, beforeEach } from "vitest";

const conn = {
  getBalance: vi.fn(),
  getParsedTokenAccountsByOwner: vi.fn(),
};
vi.mock("@/lib/solana/rpc", () => ({ solanaConnection: () => conn }));

import { sortBags, splitBags, solanaBags, type Bag } from "@/lib/bags";

const bag = (id: string, amount: number, value: number | null): Bag => ({ chain: "solana", id, symbol: id, name: id, logo: null, amount, price: value == null ? null : value / amount, value, href: null });
const WALLET = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const PEPE = "PepeMint11111111111111111111111111111111111";
const OMT = "OmTokenMint1111111111111111111111111111111";
const SPAM = "SpamMint11111111111111111111111111111111111";

describe("sortBags / splitBags", () => {
  it("sorts by value, unpriced last, and folds dust", () => {
    const r = splitBags([bag("a", 10, 5), bag("b", 1, 500), bag("c", 1e9, null), bag("d", 3, 0.001), bag("e", 0, 99)]);
    expect(r.main.map((b) => b.id)).toEqual(["b", "a"]);
    expect(r.small.map((b) => b.id)).toEqual(["d", "c"]);
    expect(r.total).toBe(505);
    expect(sortBags([bag("x", 5, null), bag("y", 50, null)]).map((b) => b.id)).toEqual(["y", "x"]);
  });
});

describe("solanaBags", () => {
  beforeEach(() => {
    conn.getBalance.mockResolvedValue(2_000_000_000);
    const acc = (mint: string, ui: string) => ({ account: { data: { parsed: { info: { mint, tokenAmount: { uiAmountString: ui } } } } } });
    conn.getParsedTokenAccountsByOwner
      .mockResolvedValueOnce({ value: [acc(PEPE, "1000000"), acc(SPAM, "5"), acc(PEPE, "500000")] })
      .mockResolvedValueOnce({ value: [acc(OMT, "250")] });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
      { id: "So11111111111111111111111111111111111111112", symbol: "SOL", name: "Wrapped SOL", usdPrice: 150 },
      { id: PEPE, symbol: "PEPE", name: "Pepe", icon: "https://img/pepe.png", usdPrice: 0.00001 },
      { id: SPAM, symbol: "FREE", name: "Claim now", icon: "javascript:alert(1)" },
    ]))));
  });

  it("merges accounts, uses Jupiter prices, our names for OM tokens, rejects unsafe logos", async () => {
    const om = vi.fn(async () => [{ id: "t1", name: "Om Token", ticker: "OMT", logo_url: "https://db/logo.png", price_usd: 0.4, mint_address: OMT }]);
    const r = splitBags(await solanaBags(WALLET, om));
    expect(r.main.map((b) => b.symbol)).toEqual(["SOL", "OMT", "PEPE"]);
    expect(r.main[0].value).toBe(300);
    expect(r.main[1]).toMatchObject({ name: "Om Token", value: 100, href: "/launchpad/t1" });
    expect(r.main[2].amount).toBe(1_500_000);
    expect(r.small[0]).toMatchObject({ symbol: "FREE", logo: null, value: null });
    expect(om).toHaveBeenCalledWith([PEPE, SPAM, OMT]);
  });
});
