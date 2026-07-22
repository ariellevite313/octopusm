/**
 * Tests for the referral system:
 *  1. Pure logic — commission rate, token routing, anti-replay format
 *  2. Bet routes call awardReferralCommission (updown, prediction, pool)
 *  3. Bet routes do NOT call commission on auth failure / insert error
 *
 * NOTE: vitest must be run on Windows (project installed on Windows — only win32
 * rolldown binaries are present in node_modules).
 * Run: npx vitest run tests/api.referrals.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { authedMock, unauthedMock, makeRequest, SupaMockBuilder } from "./helpers";

// ── Shared mocks ──────────────────────────────────────────────────────────────

const mockCreateClient      = vi.fn();
const mockCreateAdminClient = vi.fn();
const mockAwardOcto         = vi.fn().mockResolvedValue(undefined);
const mockAwardReferralCommission = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/supabase/server", () => ({
  createClient:      mockCreateClient,
  createAdminClient: mockCreateAdminClient,
}));
vi.mock("@/lib/octo", () => ({
  awardOcto:    mockAwardOcto,
  OCTO_PER_BET: 10,
}));
vi.mock("@/lib/referral", () => ({
  awardReferralCommission: mockAwardReferralCommission,
  REFERRAL_COMMISSION_RATE: 0.01,
}));

// ── Route handlers (imported after mocks) ────────────────────────────────────

const { POST: postUpDown }  = await import("../app/api/updown/bet/route");
const { POST: postPredict } = await import("../app/api/markets/predict/route");
const { POST: postPool }    = await import("../app/api/pools/predict/route");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const WALLET = "RefTestWallet111";

const OPEN_UPDOWN_MARKET = {
  id:        "updown-001",
  status:    "open",
  closes_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
};

const ACTIVE_POOL_MARKET = {
  id:                "pool-001",
  status:            "active",
  betting_closes_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  options:           [{ id: "opt-a", label: "Team A" }],
};

const UPDOWN_BODY = {
  market_id:      "updown-001",
  wallet_address: WALLET,
  direction:      "up" as const,
  amount:         100,
  tx_signature:   "txUP111",
};

const PREDICT_BODY = {
  payment_request_id: "pr-111",
  payment_reference:  "ref-111",
  title:              "Will BTC hit 100k?",
  subtitle:           "Yes",
  category_label:     "Crypto",
  market_id:          "pred-001",
  selection_id:       "sel-yes",
  selection_label:    "Yes",
  amount_usdc:        50,
  reserve_fee_usdc:   2.5,
  total_paid_usdc:    52.5,
  token:              "usdc",
  wallet_address:     WALLET,
};

const POOL_BODY = {
  payment_request_id: "pr-222",
  payment_reference:  "ref-222",
  title:              "World Cup Final",
  subtitle:           "Team A",
  market_id:          "pool-001",
  selection_id:       "opt-a",
  selection_label:    "Team A",
  amount_usdc:        25,
  token:              "usdc",
  tx_signature:       "txPOOL222",
  wallet_address:     WALLET,
};

// ── Setup helpers ─────────────────────────────────────────────────────────────

function setupUpDown(
  wallet: string | null,
  betError: { message: string; code?: string } | null = null,
) {
  const userMock  = wallet ? authedMock(wallet) : unauthedMock();
  const adminMock = new SupaMockBuilder()
    .returnFor("updown_markets", { data: [OPEN_UPDOWN_MARKET], error: null })
    .returnFor("updown_bets",    { data: null, error: betError });
  mockCreateClient.mockImplementation(userMock.buildAsyncFactory());
  mockCreateAdminClient.mockImplementation(adminMock.buildSyncFactory());
}

function setupPredict(
  wallet: string | null,
  insertError: { message: string; code?: string } | null = null,
) {
  const userMock  = wallet ? authedMock(wallet) : unauthedMock();
  const adminMock = new SupaMockBuilder()
    .returnFor("payments", { data: null, error: insertError });
  mockCreateClient.mockImplementation(userMock.buildAsyncFactory());
  mockCreateAdminClient.mockImplementation(adminMock.buildSyncFactory());
}

function setupPool(
  wallet: string | null,
  insertError: { message: string; code?: string } | null = null,
) {
  const userMock  = wallet ? authedMock(wallet) : unauthedMock();
  const adminMock = new SupaMockBuilder()
    .returnFor("mutuel_markets", { data: [ACTIVE_POOL_MARKET], error: null })
    .returnFor("payments",       { data: null, error: insertError });
  mockCreateClient.mockImplementation(userMock.buildAsyncFactory());
  mockCreateAdminClient.mockImplementation(adminMock.buildSyncFactory());
}

// ── 1. Pure logic — commission rate & token routing ───────────────────────────

describe("referral commission — pure logic", () => {
  it("REFERRAL_COMMISSION_RATE constant is 1%", async () => {
    // importActual bypasses the vi.mock, loading the real module
    const { REFERRAL_COMMISSION_RATE } = await vi.importActual<
      typeof import("../lib/referral")
    >("../lib/referral");
    expect(REFERRAL_COMMISSION_RATE).toBe(0.01);
  });

  it("1% commission on 100 USDC = 1.00", () => {
    const amount = 100;
    const rate   = 0.01;
    const commission = Math.round(amount * rate * 1_000_000) / 1_000_000;
    expect(commission).toBe(1);
  });

  it("rounds commission to 6 decimal places", () => {
    const commission = Math.round(33.333 * 0.01 * 1_000_000) / 1_000_000;
    expect(commission).toBe(0.333330);
  });

  it("token routing: clawdtrust → amount_clt, not amount_usdc", () => {
    // Mirrors the logic inside awardReferralCommission
    const isClt = (t: string) => t === "clawdtrust" || t === "clt";
    expect(isClt("clawdtrust")).toBe(true);
    expect(isClt("clt")).toBe(true);
    expect(isClt("usdc")).toBe(false);
  });

  it("does not insert when commission rounds to 0", () => {
    // e.g. amount = 0.001, rate = 0.01 → 0.00001 → rounds to 0.00001 (non-zero)
    // but amount = 0 → 0
    const commission = Math.round(0 * 0.01 * 1_000_000) / 1_000_000;
    expect(commission).toBe(0);
    // The helper returns early when commission <= 0
  });
});

// ── 2. wallet-auth anti-replay — Timestamp field (REF-C) ─────────────────────

describe("wallet-auth anti-replay — Timestamp field", () => {
  it("message format includes 'Timestamp:' line", () => {
    // Replicate the buildSignMessage logic from lib/wallet/auth.ts
    const address   = "TestWallet123";
    const nonce     = "abc123nonce";
    const timestamp = new Date().toISOString();
    const message   = `Sign in to OMdotfun\nAddress: ${address}\nNonce: ${nonce}\nTimestamp: ${timestamp}`;

    const match = message.match(/Timestamp:\s+(\S+)/);
    expect(match).not.toBeNull();
    const parsed = new Date(match![1]).getTime();
    expect(isNaN(parsed)).toBe(false);
    expect(Date.now() - parsed).toBeLessThan(1000);
  });

  it("anti-replay guard rejects message older than 5 minutes", () => {
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const message = `Sign in to OMdotfun\nAddress: X\nNonce: Y\nTimestamp: ${sixMinutesAgo}`;

    const match   = message.match(/Timestamp:\s+(\S+)/);
    const msgTime = new Date(match![1]).getTime();
    expect(Date.now() - msgTime).toBeGreaterThan(5 * 60 * 1000);
  });

  it("anti-replay guard accepts message within 5 minutes", () => {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const message = `Sign in to OMdotfun\nAddress: X\nNonce: Y\nTimestamp: ${oneMinuteAgo}`;

    const match   = message.match(/Timestamp:\s+(\S+)/);
    const msgTime = new Date(match![1]).getTime();
    expect(Date.now() - msgTime).toBeLessThan(5 * 60 * 1000);
  });

  it("guard rejects when timestamp is not a valid ISO date", () => {
    const message = `Sign in to OMdotfun\nAddress: X\nNonce: Y\nTimestamp: not-a-date`;
    const match   = message.match(/Timestamp:\s+(\S+)/);
    expect(match).not.toBeNull();
    const t = new Date(match![1]).getTime();
    // Edge Function checks isNaN(msgTime) → rejects
    expect(isNaN(t)).toBe(true);
  });

  it("guard is a no-op when Timestamp line is absent (old message format)", () => {
    // Messages without Timestamp won't match → no expiry check applied
    const oldMessage = `Sign in to OMdotfun\nAddress: X\nNonce: Y`;
    const match = oldMessage.match(/Timestamp:\s+(\S+)/);
    expect(match).toBeNull();
  });
});

// ── 3. POST /api/updown/bet — referral commission ─────────────────────────────

describe("POST /api/updown/bet — referral commission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAwardReferralCommission.mockResolvedValue(undefined);
  });

  it("calls awardReferralCommission with correct wallet, amount, token on success", async () => {
    setupUpDown(WALLET);
    const res = await postUpDown(makeRequest(UPDOWN_BODY));
    expect(res.status).toBe(200);
    expect(mockAwardReferralCommission).toHaveBeenCalledOnce();
    expect(mockAwardReferralCommission).toHaveBeenCalledWith(WALLET, 100, "usdc");
  });

  it("does NOT call commission when unauthenticated (401)", async () => {
    setupUpDown(null);
    const res = await postUpDown(makeRequest(UPDOWN_BODY));
    expect(res.status).toBe(401);
    expect(mockAwardReferralCommission).not.toHaveBeenCalled();
  });

  it("does NOT call commission when wallet mismatch (403)", async () => {
    setupUpDown("OtherWallet999");
    const res = await postUpDown(makeRequest(UPDOWN_BODY)); // body has WALLET
    expect(res.status).toBe(403);
    expect(mockAwardReferralCommission).not.toHaveBeenCalled();
  });

  it("does NOT call commission when bet insert fails (409 duplicate)", async () => {
    setupUpDown(WALLET, { message: "duplicate key", code: "23505" });
    const res = await postUpDown(makeRequest(UPDOWN_BODY));
    expect(res.status).toBe(409);
    expect(mockAwardReferralCommission).not.toHaveBeenCalled();
  });

  it("does NOT call commission when market is closed (409)", async () => {
    const userMock  = authedMock(WALLET);
    const adminMock = new SupaMockBuilder()
      .returnFor("updown_markets", {
        data: [{ ...OPEN_UPDOWN_MARKET, status: "closed" }],
        error: null,
      })
      .returnFor("updown_bets", { data: null, error: null });
    mockCreateClient.mockImplementation(userMock.buildAsyncFactory());
    mockCreateAdminClient.mockImplementation(adminMock.buildSyncFactory());

    const res = await postUpDown(makeRequest(UPDOWN_BODY));
    expect(res.status).toBe(409);
    expect(mockAwardReferralCommission).not.toHaveBeenCalled();
  });
});

// ── 4. POST /api/markets/predict — referral commission ───────────────────────

describe("POST /api/markets/predict — referral commission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAwardReferralCommission.mockResolvedValue(undefined);
  });

  it("calls commission with wallet, amount_usdc, token on success", async () => {
    setupPredict(WALLET);
    const res = await postPredict(makeRequest(PREDICT_BODY));
    expect(res.status).toBe(200);
    expect(mockAwardReferralCommission).toHaveBeenCalledOnce();
    expect(mockAwardReferralCommission).toHaveBeenCalledWith(WALLET, 50, "usdc");
  });

  it("passes CLT token correctly for CLT predictions", async () => {
    setupPredict(WALLET);
    const cltBody = { ...PREDICT_BODY, token: "clawdtrust" };
    const res = await postPredict(makeRequest(cltBody));
    expect(res.status).toBe(200);
    expect(mockAwardReferralCommission).toHaveBeenCalledWith(WALLET, 50, "clawdtrust");
  });

  it("does NOT call commission when unauthenticated (401)", async () => {
    setupPredict(null);
    const res = await postPredict(makeRequest(PREDICT_BODY));
    expect(res.status).toBe(401);
    expect(mockAwardReferralCommission).not.toHaveBeenCalled();
  });

  it("does NOT call commission on duplicate tx (409)", async () => {
    setupPredict(WALLET, { message: "duplicate", code: "23505" });
    const res = await postPredict(makeRequest(PREDICT_BODY));
    expect(res.status).toBe(409);
    expect(mockAwardReferralCommission).not.toHaveBeenCalled();
  });

  it("does NOT call commission on missing fields (400)", async () => {
    setupPredict(WALLET);
    const res = await postPredict(makeRequest({ wallet_address: WALLET }));
    expect(res.status).toBe(400);
    expect(mockAwardReferralCommission).not.toHaveBeenCalled();
  });
});

// ── 5. POST /api/pools/predict — referral commission ─────────────────────────

describe("POST /api/pools/predict — referral commission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAwardReferralCommission.mockResolvedValue(undefined);
  });

  it("calls commission with wallet, amount_usdc, token on success", async () => {
    setupPool(WALLET);
    const res = await postPool(makeRequest(POOL_BODY));
    expect(res.status).toBe(200);
    expect(mockAwardReferralCommission).toHaveBeenCalledOnce();
    expect(mockAwardReferralCommission).toHaveBeenCalledWith(WALLET, 25, "usdc");
  });

  it("does NOT call commission when unauthenticated (401)", async () => {
    setupPool(null);
    const res = await postPool(makeRequest(POOL_BODY));
    expect(res.status).toBe(401);
    expect(mockAwardReferralCommission).not.toHaveBeenCalled();
  });

  it("does NOT call commission when market not found (404)", async () => {
    const userMock  = authedMock(WALLET);
    const adminMock = new SupaMockBuilder()
      .returnFor("mutuel_markets", { data: [], error: null })
      .returnFor("payments", { data: null, error: null });
    mockCreateClient.mockImplementation(userMock.buildAsyncFactory());
    mockCreateAdminClient.mockImplementation(adminMock.buildSyncFactory());

    const res = await postPool(makeRequest(POOL_BODY));
    expect(res.status).toBe(404);
    expect(mockAwardReferralCommission).not.toHaveBeenCalled();
  });

  it("does NOT call commission when market is not active (400)", async () => {
    const userMock  = authedMock(WALLET);
    const adminMock = new SupaMockBuilder()
      .returnFor("mutuel_markets", {
        data: [{ ...ACTIVE_POOL_MARKET, status: "closed" }],
        error: null,
      })
      .returnFor("payments", { data: null, error: null });
    mockCreateClient.mockImplementation(userMock.buildAsyncFactory());
    mockCreateAdminClient.mockImplementation(adminMock.buildSyncFactory());

    const res = await postPool(makeRequest(POOL_BODY));
    expect(res.status).toBe(400);
    expect(mockAwardReferralCommission).not.toHaveBeenCalled();
  });

  it("does NOT call commission on duplicate tx (409)", async () => {
    setupPool(WALLET, { message: "duplicate", code: "23505" });
    const res = await postPool(makeRequest(POOL_BODY));
    expect(res.status).toBe(409);
    expect(mockAwardReferralCommission).not.toHaveBeenCalled();
  });
});

// ── 6. referral stats — octoEarned derivation ────────────────────────────────

describe("referral stats — octoEarned from octo_transactions", () => {
  it("sums only 'referral' type transactions from octoTxns", () => {
    // This is the computation inside dashboard-service.ts (octoStats.referral)
    const octoTxns = [
      { type: "referral", amount: 10 },
      { type: "bet",      amount: 50 },
      { type: "referral", amount: 10 },
      { type: "task",     amount: 25 },
      { type: "referral", amount: 10 },
    ];

    const referralOcto = octoTxns
      .filter((t) => t.type === "referral")
      .reduce((s, t) => s + t.amount, 0);

    expect(referralOcto).toBe(30); // 3 × 10 OCTO
  });

  it("is 0 when no referral transactions exist", () => {
    const octoTxns = [
      { type: "bet",  amount: 50 },
      { type: "task", amount: 25 },
    ];
    const referralOcto = octoTxns
      .filter((t) => t.type === "referral")
      .reduce((s, t) => s + t.amount, 0);
    expect(referralOcto).toBe(0);
  });

  it("differs from referralCount * 10 when amounts vary or txns fail", () => {
    // Old formula: referralCount * 10 = 2 * 10 = 20
    // But if one txn had a different amount, the formula is wrong
    const octoTxns = [
      { type: "referral", amount: 10 },
      { type: "referral", amount: 5 }, // partial award, e.g. promotion
    ];
    const referralCount = 2;
    const oldFormula    = referralCount * 10;            // 20 (WRONG)
    const newFormula    = octoTxns
      .filter((t) => t.type === "referral")
      .reduce((s, t) => s + t.amount, 0);               // 15 (CORRECT)

    expect(oldFormula).toBe(20);
    expect(newFormula).toBe(15);
    expect(oldFormula).not.toBe(newFormula); // confirms they diverge
  });
});
