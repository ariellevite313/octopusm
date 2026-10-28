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

// Session : le wallet connecté est celui du créateur de test
vi.mock("@/lib/social/session", () => ({
  requireWallet: async () => ({ wallet: "TxCreatorWallet" }),
  runAsAgent: <T,>(_w: string, fn: () => Promise<T>) => fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient:      vi.fn(),
  createAdminClient: mockCreateAdminClient,
}));

// Mock DBC builder to avoid real Solana calls in prepare-tx tests
vi.mock("@/lib/solana/dbc", () => ({
  buildSplitPoolTransactions: vi.fn().mockResolvedValue({
    txABase64:   "txA==",
    txBBase64:   "txB==",
    txCBase64:   "txC==",
    mintAddress: "MintAddress111",
  }),
  buildStockPairedTransactions: vi.fn(),
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
    // Sous-classe : conserve Keypair.generate (statique non énumérable) et surcharge fromSecretKey
    Keypair: class extends real.Keypair {
      static fromSecretKey = vi.fn().mockReturnValue({
        publicKey: { toBase58: () => "MintAddressBase58" },
        secretKey: new Uint8Array(64),
      });
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
    // Le logo est servi via le proxy d'image du site (toujours accessible)
    expect(body.image).toBe("https://omdot.fun/api/launchpad/meta-token-uuid/image");
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

  it("still points to the image proxy when logo_url is null", async () => {
    mockCreateAdminClient.mockReturnValue(buildMetaClient({ ...FULL_TOKEN, logo_url: null }));

    const req  = new Request("https://omdot.fun/api/launchpad/meta-token-uuid/metadata");
    const res  = await getMetadata(req, META_PARAMS);
    const body = await json(res) as { image: string };

    expect(body.image).toContain("/api/launchpad/meta-token-uuid/image");
  });

  it("sets Cache-Control header", async () => {
    mockCreateAdminClient.mockReturnValue(buildMetaClient(FULL_TOKEN));

    const req = new Request("https://omdot.fun/api/launchpad/meta-token-uuid/metadata");
    const res = await getMetadata(req, META_PARAMS);

    expect(res.headers.get("Cache-Control")).toContain("max-age=60");
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
    mockCreateAdminClient.mockReturnValue(buildPrepareTxClient({ ...PENDING_TX_TOKEN, creator_wallet: "SomeoneElse" }));

    const res = await postPrepareTx(
      makeRequest({ walletAddress: "TxCreatorWallet" }),
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

  it("generates and stores a mint keypair when none exists yet", async () => {
    const updateSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    mockCreateAdminClient.mockReturnValue(
      buildPrepareTxClient({ ...PENDING_TX_TOKEN, mint_address: null, vanity_secret_key: null }, updateSpy)
    );

    const res = await postPrepareTx(
      makeRequest({ walletAddress: "TxCreatorWallet" }),
      PREPARE_PARAMS
    );
    expect(res.status).toBe(200);
    const firstUpdate = updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(firstUpdate).toHaveProperty("mint_address");
    expect(firstUpdate).toHaveProperty("vanity_secret_key");
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
    expect((await json(res)).error).toMatch(/corrompu/i);
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

  it("returns cached transactions when prepared less than 45s ago", async () => {
    const tokenWithCache = {
      ...PENDING_TX_TOKEN,
      tx_base64:      JSON.stringify({ a: "cachedA==", b: "cachedB==", c: "cachedC==" }),
      tx_prepared_at: new Date(Date.now() - 10_000).toISOString(), // 10s ago
    };
    mockCreateAdminClient.mockReturnValue(buildPrepareTxClient(tokenWithCache));

    const { buildSplitPoolTransactions } = await import("@/lib/solana/dbc");
    const res  = await postPrepareTx(makeRequest({ walletAddress: "TxCreatorWallet" }), PREPARE_PARAMS);
    const body = await json(res) as { txABase64?: string; txBBase64?: string; txCBase64?: string };

    expect(res.status).toBe(200);
    expect(body.txABase64).toBe("cachedA==");
    expect(body.txBBase64).toBe("cachedB==");
    expect(body.txCBase64).toBe("cachedC==");
    expect(buildSplitPoolTransactions).not.toHaveBeenCalled();
  });

  it("ignores stale cache (>45s) and rebuilds the transactions", async () => {
    const tokenWithStaleCache = {
      ...PENDING_TX_TOKEN,
      tx_base64:      JSON.stringify({ a: "staleA==", b: "staleB==", c: null }),
      tx_prepared_at: new Date(Date.now() - 60_000).toISOString(), // expired
    };
    const updateSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    mockCreateAdminClient.mockReturnValue(buildPrepareTxClient(tokenWithStaleCache, updateSpy));

    const { buildSplitPoolTransactions } = await import("@/lib/solana/dbc");
    vi.mocked(buildSplitPoolTransactions).mockResolvedValue({
      txABase64: "freshA==", txBBase64: "freshB==", txCBase64: "freshC==", mintAddress: "MintAddressBase58",
    } as never);

    const res  = await postPrepareTx(makeRequest({ walletAddress: "TxCreatorWallet" }), PREPARE_PARAMS);
    const body = await json(res) as { txABase64?: string };

    expect(res.status).toBe(200);
    expect(body.txABase64).toBe("freshA==");
    expect(buildSplitPoolTransactions).toHaveBeenCalledOnce();
    const updateArg = updateSpy.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(JSON.parse(updateArg.tx_base64 as string)).toMatchObject({ a: "freshA==", b: "freshB==" });
    expect(updateArg).toHaveProperty("tx_prepared_at");
  });

  it("builds the transactions when no cache exists at all", async () => {
    mockCreateAdminClient.mockReturnValue(buildPrepareTxClient(PENDING_TX_TOKEN));

    const { buildSplitPoolTransactions } = await import("@/lib/solana/dbc");
    vi.mocked(buildSplitPoolTransactions).mockResolvedValue({
      txABase64: "newA==", txBBase64: "newB==", mintAddress: "MintAddressBase58",
    } as never);

    const res  = await postPrepareTx(makeRequest({ walletAddress: "TxCreatorWallet" }), PREPARE_PARAMS);
    const body = await json(res) as { txABase64?: string };

    expect(res.status).toBe(200);
    expect(body.txABase64).toBe("newA==");
    expect(buildSplitPoolTransactions).toHaveBeenCalledOnce();
  });
});
