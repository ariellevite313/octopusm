/**
 * Tests for GET /api/launchpad/[id]/metadata
 * Tests for POST /api/launchpad/[id]/prepare-tx (validation paths only)
 *
 * Covers:
 *  Metadata:
 *   1. Token not found → 404
 *   2. Returns valid Metaplex-compatible JSON
 *   3. Falls back to default image when logo_url is null
 *   4. Cache-Control header is present
 *
 *  Prepare-tx (validation only — full DBC path requires on-chain mocking):
 *   5. Missing walletAddress → 400
 *   6. Token not found → 404
 *   7. Wrong wallet → 403
 *   8. Token already active → 409
 *   9. Missing vanity_secret_key → 202
 *  10. Bad secret key size (< 64 bytes) → 422
 *  11. Returns cached tx within 45s window
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { json } from "./helpers";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const { mockCreateAdminClient } = vi.hoisted(() => ({
  mockCreateAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient:      vi.fn(),
  createAdminClient: mockCreateAdminClient,
}));

// Mock DBC builder to avoid real Solana calls in prepare-tx tests
vi.mock("@/lib/solana/dbc", () => ({
  buildCreatePoolTransaction: vi.fn().mockResolvedValue({
    transactionBase64: "base64TxData==",
    mintAddress:       "MintAddress111",
  }),
  buildMetadataJson: vi.fn().mockReturnValue({ name: "Test", symbol: "TST" }),
}));

// Mock Keypair.fromSecretKey — the test fixture uses 64 zero-bytes which is
// an invalid Ed25519 key and would throw. The mock bypasses key validation
// since buildCreatePoolTransaction is already mocked anyway.
// We spread the real module so Keypair.generate and other statics remain intact.
vi.mock("@solana/web3.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("@solana/web3.js")>();
  return {
    ...real,
    Keypair: {
      ...real.Keypair,
      fromSecretKey: vi.fn().mockReturnValue({
        publicKey: { toBase58: () => "MintAddressBase58" },
      }),
    },
  };
});

// ── Route handlers ────────────────────────────────────────────────────────────

const { GET:  getMetadata } = await import("../app/api/launchpad/[id]/metadata/route");
const { POST: postPrepareTx } = await import("../app/api/launchpad/[id]/prepare-tx/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

const META_PARAMS    = { params: Promise.resolve({ id: "meta-token-uuid" }) };
const PREPARE_PARAMS = { params: Promise.resolve({ id: "tx-token-uuid" }) };

function buildMetaClient(token: object | null) {
  return {
    from: vi.fn(() => ({
      select:      vi.fn().mockReturnThis(),
      eq:          vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: token, error: null }),
    })),
  };
}

function buildPrepareTxClient(token: object | null, updateSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })) {
  return {
    from: vi.fn(() => ({
      select:      vi.fn().mockReturnThis(),
      eq:          vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: token, error: null }),
      update:      updateSpy,
    })),
  };
}

// ── Token fixtures ────────────────────────────────────────────────────────────

const FULL_TOKEN = {
  name:        "CoolToken",
  ticker:      "COOL",
  description: "A great token",
  logo_url:    "https://cdn.example.com/logo.png",
  website:     "https://cooltoken.com",
  twitter:     "https://x.com/cool",
  telegram:    "https://t.me/cool",
};

const PENDING_TX_TOKEN = {
  id:               "tx-token-uuid",
  name:             "TxToken",
  ticker:           "TXT",
  description:      "Tx test token",
  logo_url:         "https://cdn.example.com/logo.png",
  status:           "pending",
  creator_wallet:   "TxCreatorWallet",
  supply:           1_000_000_000,
  creator_fee_pct:  1,
  first_buy_amount: null,
  is_scheduled:     false,
  scheduled_at:     null,
  metadata_uri:     null,
  tx_base64:        null,
  tx_prepared_at:   null,
  mint_address:     "MintAddressBase58",
  vanity_secret_key: Buffer.from(new Uint8Array(64)).toString("base64"), // valid 64-byte key
};

beforeEach(() => vi.clearAllMocks());

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/launchpad/[id]/metadata
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/launchpad/[id]/metadata", () => {
  it("returns 404 when token does not exist", async () => {
    mockCreateAdminClient.mockReturnValue(buildMetaClient(null));

    const req = new Request("https://omdot.fun/api/launchpad/meta-token-uuid/metadata");
    const res = await getMetadata(req, META_PARAMS);
    expect(res.status).toBe(404);
  });

  it("returns valid Metaplex-compatible JSON for an existing token", async () => {
    mockCreateAdminClient.mockReturnValue(buildMetaClient(FULL_TOKEN));

    const req = new Request("https://omdot.fun/api/launchpad/meta-token-uuid/metadata");
    const res = await getMetadata(req, META_PARAMS);
    const body = await json(res) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.name).toBe("CoolToken");
    expect(body.symbol).toBe("COOL");
    expect(body.description).toBe("A great token");
    expect(body.image).toBe("https://cdn.example.com/logo.png");
    expect(body.external_url).toBe("https://cooltoken.com");
  });

  it("uses extensions.twitter and extensions.telegram from social fields", async () => {
    mockCreateAdminClient.mockReturnValue(buildMetaClient(FULL_TOKEN));

    const req  = new Request("https://omdot.fun/api/launchpad/meta-token-uuid/metadata");
    const res  = await getMetadata(req, META_PARAMS);
    const body = await json(res) as { extensions?: Record<string, unknown> };

    expect(body.extensions).toBeDefined();
    expect(body.extensions?.twitter).toBe("https://x.com/cool");
    expect(body.extensions?.telegram).toBe("https://t.me/cool");
  });

  it("falls back to default image when logo_url is null", async () => {
    mockCreateAdminClient.mockReturnValue(buildMetaClient({ ...FULL_TOKEN, logo_url: null }));

    const req  = new Request("https://omdot.fun/api/launchpad/meta-token-uuid/metadata");
    const res  = await getMetadata(req, META_PARAMS);
    const body = await json(res) as { image: string };

    expect(body.image).toContain("octomarket-logo.png");
  });

  it("sets Cache-Control header", async () => {
    mockCreateAdminClient.mockReturnValue(buildMetaClient(FULL_TOKEN));

    const req = new Request("https://omdot.fun/api/launchpad/meta-token-uuid/metadata");
    const res = await getMetadata(req, META_PARAMS);

    expect(res.headers.get("Cache-Control")).toContain("max-age=300");
  });

  it("returns empty string for external_url when website is null", async () => {
    mockCreateAdminClient.mockReturnValue(buildMetaClient({ ...FULL_TOKEN, website: null }));

    const req  = new Request("https://omdot.fun/api/launchpad/meta-token-uuid/metadata");
    const res  = await getMetadata(req, META_PARAMS);
    const body = await json(res) as { external_url: string };

    expect(body.external_url).toBe("");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/launchpad/[id]/prepare-tx — validation paths
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /api/launchpad/[id]/prepare-tx — validation", () => {
  function makeRequest(body: object): Request {
    return new Request("https://omdot.fun/api/launchpad/tx-token-uuid/prepare-tx", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
  }

  it("returns 400 when walletAddress is missing", async () => {
    const res = await postPrepareTx(makeRequest({}), PREPARE_PARAMS);
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/walletAddress/i);
  });

  it("returns 404 when token does not exist", async () => {
    mockCreateAdminClient.mockReturnValue(buildPrepareTxClient(null));

    const res = await postPrepareTx(
      makeRequest({ walletAddress: "TxCreatorWallet" }),
      PREPARE_PARAMS
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when walletAddress does not match creator_wallet", async () => {
    mockCreateAdminClient.mockReturnValue(buildPrepareTxClient(PENDING_TX_TOKEN));

    const res = await postPrepareTx(
      makeRequest({ walletAddress: "WrongWallet" }),
      PREPARE_PARAMS
    );
    expect(res.status).toBe(403);
  });

  it("returns 409 when token status is not pending", async () => {
    mockCreateAdminClient.mockReturnValue(buildPrepareTxClient({ ...PENDING_TX_TOKEN, status: "active" }));

    const res = await postPrepareTx(
      makeRequest({ walletAddress: "TxCreatorWallet" }),
      PREPARE_PARAMS
    );
    expect(res.status).toBe(409);
    expect((await json(res)).error).toMatch(/already/i);
  });

  it("returns 202 when mint_address is missing (keypair not ready)", async () => {
    mockCreateAdminClient.mockReturnValue(
      buildPrepareTxClient({ ...PENDING_TX_TOKEN, mint_address: null, vanity_secret_key: null })
    );

    const res = await postPrepareTx(
      makeRequest({ walletAddress: "TxCreatorWallet" }),
      PREPARE_PARAMS
    );
    expect(res.status).toBe(202);
  });

  it("returns 422 when secret key is wrong size (old/corrupted token)", async () => {
    // 32 bytes base64 instead of 64
    const shortSecret = Buffer.from(new Uint8Array(32)).toString("base64");
    mockCreateAdminClient.mockReturnValue(
      buildPrepareTxClient({ ...PENDING_TX_TOKEN, vanity_secret_key: shortSecret })
    );

    const res = await postPrepareTx(
      makeRequest({ walletAddress: "TxCreatorWallet" }),
      PREPARE_PARAMS
    );
    expect(res.status).toBe(422);
    expect((await json(res)).error).toMatch(/recr[eé]/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/launchpad/[id]/prepare-tx — tx caching
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /api/launchpad/[id]/prepare-tx — 45s tx cache", () => {
  function makeRequest(body: object): Request {
    return new Request("https://omdot.fun/api/launchpad/tx-token-uuid/prepare-tx", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
  }

  it("returns cached tx_base64 when prepared less than 45s ago", async () => {
    const recentTimestamp = new Date(Date.now() - 10_000).toISOString(); // 10s ago
    const tokenWithCache = {
      ...PENDING_TX_TOKEN,
      tx_base64:      "cachedBase64Tx==",
      tx_prepared_at: recentTimestamp,
    };
    mockCreateAdminClient.mockReturnValue(buildPrepareTxClient(tokenWithCache));

    const { buildCreatePoolTransaction } = await import("@/lib/solana/dbc");
    const res  = await postPrepareTx(makeRequest({ walletAddress: "TxCreatorWallet" }), PREPARE_PARAMS);
    const body = await json(res) as { transactionBase64?: string };

    expect(res.status).toBe(200);
    expect(body.transactionBase64).toBe("cachedBase64Tx==");
    // DBC builder should NOT have been called
    expect(buildCreatePoolTransaction).not.toHaveBeenCalled();
  });

  it("ignores stale cache (>45s) and calls DBC builder", async () => {
    const staleTimestamp = new Date(Date.now() - 60_000).toISOString(); // 60s ago — expired
    const tokenWithStaleCache = {
      ...PENDING_TX_TOKEN,
      tx_base64:      "staleBase64Tx==",
      tx_prepared_at: staleTimestamp,
    };

    const updateSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    mockCreateAdminClient.mockReturnValue(buildPrepareTxClient(tokenWithStaleCache, updateSpy));

    const { buildCreatePoolTransaction } = await import("@/lib/solana/dbc");
    vi.mocked(buildCreatePoolTransaction).mockResolvedValue({
      transactionBase64: "freshBase64Tx==",
      mintAddress:       "MintAddressBase58",
    });

    const res  = await postPrepareTx(makeRequest({ walletAddress: "TxCreatorWallet" }), PREPARE_PARAMS);
    const body = await json(res) as { transactionBase64?: string };

    expect(res.status).toBe(200);
    expect(body.transactionBase64).toBe("freshBase64Tx==");
    expect(buildCreatePoolTransaction).toHaveBeenCalledOnce();
    // New tx should be persisted
    const updateArg = updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg).toHaveProperty("tx_base64", "freshBase64Tx==");
    expect(updateArg).toHaveProperty("tx_prepared_at");
  });

  it("calls DBC builder when no cache exists at all", async () => {
    mockCreateAdminClient.mockReturnValue(buildPrepareTxClient(PENDING_TX_TOKEN));

    const { buildCreatePoolTransaction } = await import("@/lib/solana/dbc");
    vi.mocked(buildCreatePoolTransaction).mockResolvedValue({
      transactionBase64: "newTx==",
      mintAddress:       "MintAddressBase58",
    });

    const res  = await postPrepareTx(makeRequest({ walletAddress: "TxCreatorWallet" }), PREPARE_PARAMS);
    const body = await json(res) as { transactionBase64?: string };

    expect(res.status).toBe(200);
    expect(body.transactionBase64).toBe("newTx==");
    expect(buildCreatePoolTransaction).toHaveBeenCalledOnce();
  });
});
