import { describe, it, expect, vi, beforeEach } from "vitest";
import { authedMock, unauthedMock, makeRequest, json, SupaMockBuilder } from "./helpers";

const mockCreateClient      = vi.fn();
const mockCreateAdminClient = vi.fn();
const mockAwardOcto         = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/supabase/server", () => ({
  createClient:      mockCreateClient,
  createAdminClient: mockCreateAdminClient,
}));
vi.mock("@/lib/octo", () => ({
  awardOcto:    mockAwardOcto,
  OCTO_PER_BET: 10,
}));

const { POST } = await import("../app/api/pools/predict/route");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const WALLET = "WalletAAA111";
const MARKET_ID   = "market-uuid-001";
const SELECTION_ID = "opt-uuid-yes";

const ACTIVE_MARKET = {
  id:                MARKET_ID,
  status:            "active",
  betting_closes_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  options:           [{ id: SELECTION_ID }, { id: "opt-uuid-no" }],
};

const VALID_BODY = {
  payment_request_id: "pr-001",
  payment_reference:  "ref-001",
  title:              "Will BTC hit 100k?",
  subtitle:           "Yes",
  market_id:          MARKET_ID,
  selection_id:       SELECTION_ID,
  selection_label:    "Yes",
  amount_usdc:        10,
  token:              "usdc",
  tx_signature:       "tx123abc",
  wallet_address:     WALLET,
};

function setup(wallet: string | null, market: unknown = ACTIVE_MARKET) {
  const userMock  = wallet ? authedMock(wallet) : unauthedMock();
  const adminMock = new SupaMockBuilder()
    .setUser(wallet ? { wallet_address: wallet } : null)
    .returnFor("mutuel_markets", { data: market ? [market] : [], error: null })
    .returnFor("payments", { data: [{ id: "pay-001" }], error: null });

  mockCreateClient.mockImplementation(userMock.buildAsyncFactory());
  mockCreateAdminClient.mockImplementation(adminMock.buildSyncFactory());
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/pools/predict", () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    setup(null);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
    expect((await json(res)).error).toMatch(/not authenticated/i);
  });

  // ── Wallet mismatch ───────────────────────────────────────────────────────

  it("returns 403 when wallet_address in body differs from session", async () => {
    setup(WALLET);
    const res = await POST(makeRequest({ ...VALID_BODY, wallet_address: "OTHER_WALLET" }));
    expect(res.status).toBe(403);
    expect((await json(res)).error).toMatch(/mismatch/i);
  });

  // ── Missing required fields ───────────────────────────────────────────────

  it("returns 400 when market_id is missing", async () => {
    setup(WALLET);
    const res = await POST(makeRequest({ ...VALID_BODY, market_id: "" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/missing/i);
  });

  it("returns 400 when tx_signature is missing", async () => {
    setup(WALLET);
    const res = await POST(makeRequest({ ...VALID_BODY, tx_signature: "" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/missing/i);
  });

  // ── Minimum stake ─────────────────────────────────────────────────────────

  it("returns 400 when USDC amount is below minimum (< 2)", async () => {
    setup(WALLET);
    const res = await POST(makeRequest({ ...VALID_BODY, amount_usdc: 1, token: "usdc" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/minimum/i);
  });

  it("returns 400 when CLT amount is below minimum (< 500000)", async () => {
    setup(WALLET);
    const res = await POST(makeRequest({ ...VALID_BODY, amount_usdc: 100, token: "clawdtrust" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/minimum/i);
  });

  it("accepts CLT amount above minimum", async () => {
    setup(WALLET);
    const res = await POST(makeRequest({ ...VALID_BODY, amount_usdc: 600_000, token: "clawdtrust" }));
    // Should not return 400 for minimum stake
    const body = await json(res);
    if (res.status === 400) {
      expect(body.error).not.toMatch(/minimum/i);
    }
  });

  // ── Market validation ─────────────────────────────────────────────────────

  it("returns 404 when market does not exist", async () => {
    setup(WALLET, null); // no market data
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(404);
    expect((await json(res)).error).toMatch(/not found/i);
  });

  it("returns 400 when market status is not 'active'", async () => {
    setup(WALLET, { ...ACTIVE_MARKET, status: "closed" });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/not accepting/i);
  });

  it("returns 400 when betting window has closed", async () => {
    setup(WALLET, {
      ...ACTIVE_MARKET,
      betting_closes_at: new Date(Date.now() - 60_000).toISOString(), // 1 min ago
    });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/closed/i);
  });

  it("returns 400 when selection_id is not a valid option", async () => {
    setup(WALLET);
    const res = await POST(makeRequest({ ...VALID_BODY, selection_id: "invalid-option-id" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/selection/i);
  });

  // ── Invalid JSON ──────────────────────────────────────────────────────────

  it("returns 400 for malformed JSON body", async () => {
    setup(WALLET);
    const req = new Request("https://omdot.fun/api/pools/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
