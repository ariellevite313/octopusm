/**
 * Un token xStock resté en attente (cas Miauricio) repart en lancement simple SOL quand les xStocks sont coupés :
 * même adresse, frais déjà payés non redemandés, pas de TX C.
 */
import { describe, it, expect, vi } from "vitest";
import { Keypair } from "@solana/web3.js";

const kp = Keypair.generate();
const row: Record<string, unknown> = {
  id: "t1", creator_wallet: "Creator1111111111111111111111111111111111111", status: "pending",
  name: "Miauricio", ticker: "MIAU", description: "", logo_url: null, website: null, twitter: null, telegram: null,
  supply: 1_000_000_000, first_buy_amount: null, is_scheduled: false,
  mint_address: kp.publicKey.toBase58(), vanity_secret_key: Buffer.from(kp.secretKey).toString("base64"),
  metadata_uri: null, tx_base64: JSON.stringify({ a: "oldA", b: "oldB", c: "oldC" }), tx_prepared_at: new Date().toISOString(),
  stock_symbol: "xNVDA", dbc_config_secret: "secret", dbc_config_address: "Cfg111", sol_fee_tier: "standard",
  fee_paid_at: "2026-11-05T10:00:00Z", quote_asset: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
};
const updates: Record<string, unknown>[] = [];

const { mockBuild } = vi.hoisted(() => ({ mockBuild: vi.fn() }));

vi.mock("@/lib/social/session", () => ({ requireWallet: async () => ({ wallet: "Creator1111111111111111111111111111111111111" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: () => {
      let patch: Record<string, unknown> | null = null;
      const q = {
        select: () => q,
        update: (p: Record<string, unknown>) => { patch = p; return q; },
        eq: () => q,
        maybeSingle: async () => ({ data: { ...row }, error: null }),
        then: (res: (v: unknown) => void) => {
          if (patch) { updates.push(patch); Object.assign(row, patch); }
          res({ data: [{ id: "t1" }], error: null });
        },
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/solana/dbc", () => ({
  buildSplitPoolTransactions: mockBuild,
  buildStockPairedTransactions: vi.fn(),
  buildMetadataJson: vi.fn(),
}));

delete process.env.NEXT_PUBLIC_XSTOCK_LAUNCH;
delete process.env.SOLANA_RPC_URL; // pas d'appel réseau dans ce test

const { POST } = await import("../app/api/launchpad/[id]/prepare-tx/route");

describe("prepare-tx: pending xStock token while xStock launches are off", () => {
  it("is rebuilt as a SOL launch with the same mint and no fee", async () => {
    mockBuild.mockResolvedValue({ txABase64: "A", txBBase64: "B", mintAddress: row.mint_address });
    const res = await POST(
      new Request("https://omdot.fun/api/launchpad/t1/prepare-tx", {
        method: "POST", body: JSON.stringify({ walletAddress: row.creator_wallet }),
      }),
      { params: Promise.resolve({ id: "t1" }) },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    // Conversion enregistrée en base
    expect(updates[0]).toMatchObject({ stock_symbol: null, dbc_config_address: null, dbc_config_secret: null, tx_base64: null });
    // Construit en paire SOL, même mint
    const params = mockBuild.mock.calls[0][0];
    expect(params.stockSymbol).toBeNull();
    expect(params.mintKeypair.publicKey.toBase58()).toBe(row.mint_address);
    expect(params.firstBuySol).toBe(0);
    // Frais déjà payés : pas de TX A, pas de TX C
    expect(body.txABase64).toBeNull();
    expect(body.txBBase64).toBe("B");
    expect(body.txCBase64).toBeUndefined();
    expect(body.mintAddress).toBe(row.mint_address);
  });
});
