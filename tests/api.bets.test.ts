import { describe, it, expect, vi, beforeEach } from "vitest";
import { authedMock, unauthedMock, makeRequest, json, SupaMockBuilder } from "./helpers";

// ── Shared mocks ──────────────────────────────────────────────────────────────

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
vi.mock("@/lib/referral", () => ({
  awardReferralCommission: vi.fn().mockResolvedValue(undefined),
  REFERRAL_COMMISSION_RATE: 0.01,
}));

// Route handlers — imported after mocks
const { POST: postUpDown }      = await import("../app/api/updown/bet/route");
const { POST: postPrediction }  = await import("../app/api/markets/predict/route");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const WALLET = "BetWallet111AAA";

const OPEN_MARKET = {
  id:        "updown-market-001",
  status:    "open",
  closes_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // +2h
};

const UPDOWN_BODY = {
  market_id:     "updown-market-001",
  wallet_address: WALLET,
  direction:     "up" as const,
  amount:        10,
  tx_signature:  "txABC123",
};

const PREDICTION_BODY = {
  payment_request_id: "pr-xyz",
  payment_reference:  "ref-xyz",
  title:              "Will ETH flip BTC?",
  subtitle:           "Yes",
  category_label:     "Crypto",
  market_id:          "pred-market-001",
  selection_id:       "sel-yes",
  selection_label:    "Yes",
  amount_usdc:        5,
  reserve_fee_usdc:   0.25,
  total_paid_usdc:    5.25,
  token:              "usdc",
  tx_signature:       "txDEF456",
  wallet_address:     WALLET,
};

// ── Setup helpers ─────────────────────────────────────────────────────────────

function setupUpDown(wallet: string | null, market: unknown = OPEN_MARKET, betInsertError: { message: string; code?: string } | null = null) {
  const userMock  = wallet ? authedMock(wallet) : unauthedMock();
  const adminMock = new SupaMockBuilder()
    .setUser(wallet ? { wallet_address: wallet } : null)
    .returnFor("updown_markets", { data: market ? [market] : [], error: null })
    .returnFor("updown_bets",    { data: null, error: betInsertError });

  mockCreateClient.mockImplementation(userMock.buildAsyncFactory());
  mockCreateAdminClient.mockImplementation(adminMock.buildSyncFactory());
}

function setupPrediction(wallet: string | null, insertError: { message: string; code?: string } | null = null) {
  const userMock  = wallet ? authedMock(wallet) : unauthedMock();
  const adminMock = new SupaMockBuilder()
    .setUser(wallet ? { wallet_address: wallet } : null)
    .returnFor("payments", { data: null, error: insertError });

  mockCreateClient.mockImplementation(userMock.buildAsyncFactory());
  mockCreateAdminClient.mockImplementation(adminMock.buildSyncFactory());
}

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/updown/bet
// ═════════════════════════════════════════════════════════════════════════════

describe("POST /api/updown/bet", () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    setupUpDown(null);
    const res = await postUpDown(makeRequest(UPDOWN_BODY));
    expect(res.status).toBe(401);
    expect((await json(res)).error).toMatch(/not authenticated/i);
  });

  it("returns 401 when session has no wallet", async () => {
    // User exists but no wallet_address in metadata
    const userMock = new SupaMockBuilder().setUser({});
    mockCreateClient.mockImplementation(userMock.buildAsyncFactory());
    const res = await postUpDown(makeRequest(UPDOWN_BODY));
    expect(res.status).toBe(401);
    expect((await json(res)).error).toMatch(/wallet/i);
  });

  // ── Wallet mismatch ───────────────────────────────────────────────────────

  it("returns 403 when wallet_address in body differs from session", async () => {
    setupUpDown(WALLET);
    const res = await postUpDown(makeRequest({ ...UPDOWN_BODY, wallet_address: "OTHER_WALLET" }));
    expect(res.status).toBe(403);
    expect((await json(res)).error).toMatch(/mismatch/i);
  });

  // ── Required fields ───────────────────────────────────────────────────────

  it("returns 400 when market_id is missing", async () => {
    setupUpDown(WALLET);
    const res = await postUpDown(makeRequest({ ...UPDOWN_BODY, market_id: "" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/missing/i);
  });

  it("returns 400 when tx_signature is missing", async () => {
    setupUpDown(WALLET);
    const res = await postUpDown(makeRequest({ ...UPDOWN_BODY, tx_signature: "" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/missing/i);
  });

  // ── Direction validation ──────────────────────────────────────────────────

  it("returns 400 for invalid direction", async () => {
    setupUpDown(WALLET);
    const res = await postUpDown(makeRequest({ ...UPDOWN_BODY, direction: "sideways" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/direction/i);
  });

  it("accepts 'up' as direction", async () => {
    setupUpDown(WALLET);
    const res = await postUpDown(makeRequest({ ...UPDOWN_BODY, direction: "up" }));
    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);
  });

  it("accepts 'down' as direction", async () => {
    setupUpDown(WALLET);
    const res = await postUpDown(makeRequest({ ...UPDOWN_BODY, direction: "down" }));
    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);
  });

  // ── Amount validation ─────────────────────────────────────────────────────

  it("returns 400 when amount is 0", async () => {
    setupUpDown(WALLET);
    const res = await postUpDown(makeRequest({ ...UPDOWN_BODY, amount: 0 }));
    // amount:0 is falsy → caught by the missing-fields guard before the amount>0 check
    expect(res.status).toBe(400);
  });

  it("returns 400 when amount is negative", async () => {
    setupUpDown(WALLET);
    const res = await postUpDown(makeRequest({ ...UPDOWN_BODY, amount: -5 }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/amount/i);
  });

  // ── Market validation ─────────────────────────────────────────────────────

  it("returns 404 when market does not exist", async () => {
    setupUpDown(WALLET, null);
    const res = await postUpDown(makeRequest(UPDOWN_BODY));
    expect(res.status).toBe(404);
    expect((await json(res)).error).toMatch(/not found/i);
  });

  it("returns 409 when market status is not 'open'", async () => {
    setupUpDown(WALLET, { ...OPEN_MARKET, status: "closed" });
    const res = await postUpDown(makeRequest(UPDOWN_BODY));
    expect(res.status).toBe(409);
    expect((await json(res)).error).toMatch(/closed/i);
  });

  it("returns 409 when betting phase has ended (closes_at in the past)", async () => {
    setupUpDown(WALLET, {
      ...OPEN_MARKET,
      closes_at: new Date(Date.now() - 60_000).toISOString(),
    });
    const res = await postUpDown(makeRequest(UPDOWN_BODY));
    expect(res.status).toBe(409);
    expect((await json(res)).error).toMatch(/ended/i);
  });

  // ── Duplicate transaction ─────────────────────────────────────────────────

  it("returns 409 when tx_signature was already submitted (unique constraint)", async () => {
    setupUpDown(WALLET, OPEN_MARKET, { message: "duplicate key", code: "23505" });
    const res = await postUpDown(makeRequest(UPDOWN_BODY));
    expect(res.status).toBe(409);
    expect((await json(res)).error).toMatch(/already submitted/i);
  });

  // ── DB error ──────────────────────────────────────────────────────────────

  it("returns 500 on unexpected DB error during bet insert", async () => {
    setupUpDown(WALLET, OPEN_MARKET, { message: "connection refused" });
    const res = await postUpDown(makeRequest(UPDOWN_BODY));
    expect(res.status).toBe(500);
  });

  // ── Success ───────────────────────────────────────────────────────────────

  it("returns 200 and ok:true on valid bet", async () => {
    setupUpDown(WALLET);
    const res = await postUpDown(makeRequest(UPDOWN_BODY));
    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);
  });

  it("awards OCTO after a valid bet", async () => {
    setupUpDown(WALLET);
    await postUpDown(makeRequest(UPDOWN_BODY));
    expect(mockAwardOcto).toHaveBeenCalledWith(WALLET, 10, "bet", "Up/Down bet placed");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/markets/predict
// ═════════════════════════════════════════════════════════════════════════════

describe("POST /api/markets/predict", () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    setupPrediction(null);
    const res = await postPrediction(makeRequest(PREDICTION_BODY));
    expect(res.status).toBe(401);
    expect((await json(res)).error).toMatch(/not authenticated/i);
  });

  // ── Wallet mismatch ───────────────────────────────────────────────────────

  it("returns 403 when wallet_address in body differs from session", async () => {
    setupPrediction(WALLET);
    const res = await postPrediction(makeRequest({ ...PREDICTION_BODY, wallet_address: "HACKER" }));
    expect(res.status).toBe(403);
    expect((await json(res)).error).toMatch(/mismatch/i);
  });

  // ── Required fields ───────────────────────────────────────────────────────

  it("returns 400 when market_id is missing", async () => {
    setupPrediction(WALLET);
    const res = await postPrediction(makeRequest({ ...PREDICTION_BODY, market_id: "" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/missing/i);
  });

  it("returns 400 when selection_id is missing", async () => {
    setupPrediction(WALLET);
    const res = await postPrediction(makeRequest({ ...PREDICTION_BODY, selection_id: "" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/missing/i);
  });

  it("returns 400 when payment_reference is missing", async () => {
    setupPrediction(WALLET);
    const res = await postPrediction(makeRequest({ ...PREDICTION_BODY, payment_reference: "" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/missing/i);
  });

  // ── JSON body ─────────────────────────────────────────────────────────────

  it("returns 400 for malformed JSON body", async () => {
    setupPrediction(WALLET);
    const req = new Request("https://omdot.fun/api/markets/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not json",
    });
    const res = await postPrediction(req);
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/json/i);
  });

  // ── Duplicate transaction ─────────────────────────────────────────────────

  it("returns 409 when tx_signature already exists (unique constraint)", async () => {
    setupPrediction(WALLET, { message: "duplicate key", code: "23505" });
    const res = await postPrediction(makeRequest(PREDICTION_BODY));
    expect(res.status).toBe(409);
    expect((await json(res)).error).toMatch(/already submitted/i);
  });

  // ── DB error ──────────────────────────────────────────────────────────────

  it("returns 500 on unexpected DB error", async () => {
    setupPrediction(WALLET, { message: "deadlock detected" });
    const res = await postPrediction(makeRequest(PREDICTION_BODY));
    expect(res.status).toBe(500);
  });

  // ── Success ───────────────────────────────────────────────────────────────

  it("returns 200 and ok:true on valid prediction", async () => {
    setupPrediction(WALLET);
    const res = await postPrediction(makeRequest(PREDICTION_BODY));
    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);
  });

  it("awards OCTO after a valid prediction", async () => {
    setupPrediction(WALLET);
    await postPrediction(makeRequest(PREDICTION_BODY));
    expect(mockAwardOcto).toHaveBeenCalledWith(WALLET, 10, "bet", "Prediction placed");
  });
});
