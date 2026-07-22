import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  adminAuthedMock,
  nonAdminMock,
  unauthedMock,
  makeRequest,
  json,
  SupaMockBuilder,
} from "./helpers";

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockCreateClient      = vi.fn();
const mockCreateAdminClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient:      mockCreateClient,
  createAdminClient: mockCreateAdminClient,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Route handlers loaded after mocks
const { POST: postPools }   = await import("../app/api/admin/pools/route");
const { POST: postMarkets } = await import("../app/api/admin/markets/route");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ADMIN_WALLET = "AdminWalletXYZ";

const CLOSED_POOL = {
  id:             "pool-001",
  status:         "closed",
  bet_token:      "usdc",
  creator_wallet: "CreatorWallet",
  options: [
    { id: "opt-yes", label: "Yes" },
    { id: "opt-no",  label: "No"  },
  ],
};

const BETS_MIXED = [
  { id: "bet-1", option_id: "opt-yes", amount: 100 },
  { id: "bet-2", option_id: "opt-yes", amount: 50  },
  { id: "bet-3", option_id: "opt-no",  amount: 30  },
];

const BETS_ALL_WINNERS = [
  { id: "bet-1", option_id: "opt-yes", amount: 100 },
  { id: "bet-2", option_id: "opt-yes", amount: 50  },
];

const BETS_NO_WINNERS = [
  { id: "bet-1", option_id: "opt-no", amount: 100 },
];

const PREDICTION_MARKET = {
  id:          "pred-001",
  is_resolved: false,
  options:     [{ id: "outcome-yes" }, { id: "outcome-no" }],
};

// ── Setup helpers ─────────────────────────────────────────────────────────────

function setupPoolResolve(
  userMockBuilder: SupaMockBuilder,
  market: unknown = CLOSED_POOL,
  bets: unknown[] = BETS_MIXED,
) {
  const adminMock = new SupaMockBuilder()
    .setUser({ wallet_address: ADMIN_WALLET })
    .returnFor("mutuel_markets", { data: market ? [market] : [], error: null })
    .returnFor("mutuel_bets",    { data: bets, error: null });

  mockCreateClient.mockImplementation(userMockBuilder.buildAsyncFactory());
  mockCreateAdminClient.mockImplementation(adminMock.buildSyncFactory());
}

function setupPredictionResolve(
  userMockBuilder: SupaMockBuilder,
  resolvedRows: unknown[] = [{ id: "pred-001" }],
) {
  const adminMock = new SupaMockBuilder()
    .returnFor("prediction_markets", { data: resolvedRows, error: null })
    .returnFor("prediction_history", { data: [], error: null });

  mockCreateClient.mockImplementation(userMockBuilder.buildAsyncFactory());
  mockCreateAdminClient.mockImplementation(adminMock.buildSyncFactory());
}

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/admin/pools  — action: "resolve"
// ═════════════════════════════════════════════════════════════════════════════

describe("POST /api/admin/pools — action: resolve", () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Admin guard ───────────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    setupPoolResolve(unauthedMock());
    const res = await postPools(makeRequest({ action: "resolve", marketId: "pool-001", winning_option_id: "opt-yes" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated but not admin", async () => {
    setupPoolResolve(nonAdminMock());
    const res = await postPools(makeRequest({ action: "resolve", marketId: "pool-001", winning_option_id: "opt-yes" }));
    expect(res.status).toBe(403);
  });

  // ── Input validation ──────────────────────────────────────────────────────

  it("returns 400 when marketId is missing", async () => {
    setupPoolResolve(adminAuthedMock(ADMIN_WALLET));
    const res = await postPools(makeRequest({ action: "resolve", winning_option_id: "opt-yes" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/marketId/i);
  });

  it("returns 400 when winning_option_id is missing", async () => {
    setupPoolResolve(adminAuthedMock(ADMIN_WALLET));
    const res = await postPools(makeRequest({ action: "resolve", marketId: "pool-001" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/winning_option_id/i);
  });

  // ── Market validation ─────────────────────────────────────────────────────

  it("returns 404 when market does not exist", async () => {
    setupPoolResolve(adminAuthedMock(ADMIN_WALLET), null);
    const res = await postPools(makeRequest({ action: "resolve", marketId: "pool-001", winning_option_id: "opt-yes" }));
    expect(res.status).toBe(404);
    expect((await json(res)).error).toMatch(/not found/i);
  });

  it("returns 400 when market is still 'active' (must be closed first)", async () => {
    setupPoolResolve(adminAuthedMock(ADMIN_WALLET), { ...CLOSED_POOL, status: "active" });
    const res = await postPools(makeRequest({ action: "resolve", marketId: "pool-001", winning_option_id: "opt-yes" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/closed/i);
  });

  it("returns 400 when market is still 'pending'", async () => {
    setupPoolResolve(adminAuthedMock(ADMIN_WALLET), { ...CLOSED_POOL, status: "pending" });
    const res = await postPools(makeRequest({ action: "resolve", marketId: "pool-001", winning_option_id: "opt-yes" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/closed/i);
  });

  it("returns 400 when winning_option_id is not a valid option", async () => {
    setupPoolResolve(adminAuthedMock(ADMIN_WALLET));
    const res = await postPools(makeRequest({ action: "resolve", marketId: "pool-001", winning_option_id: "opt-invalid" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/invalid winning option/i);
  });

  // ── Normal resolution: winners vs losers ──────────────────────────────────

  it("returns 200 with correct summary on normal resolution", async () => {
    setupPoolResolve(adminAuthedMock(ADMIN_WALLET), CLOSED_POOL, BETS_MIXED);
    const res = await postPools(makeRequest({ action: "resolve", marketId: "pool-001", winning_option_id: "opt-yes" }));
    expect(res.status).toBe(200);
    const body = await json(res) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.refund).toBe(false);
    const summary = body.summary as Record<string, unknown>;
    expect(summary.token).toBe("usdc");
    expect(summary.winner_count).toBe(2); // bet-1 and bet-2
    expect(summary.loser_count).toBe(1);  // bet-3
    // Total pool: 100+50+30 = 180
    expect(summary.total_pool).toBe(180);
    // Losing pool: 30; house rate 10% on losers = 3; creator 1% of 180 = 1.8
    expect(summary.losing_pool).toBe(30);
  });

  it("fee rates are correct for USDC pool (house 10%, creator 1%)", async () => {
    setupPoolResolve(adminAuthedMock(ADMIN_WALLET), CLOSED_POOL, BETS_MIXED);
    const res = await postPools(makeRequest({ action: "resolve", marketId: "pool-001", winning_option_id: "opt-yes" }));
    const body = await json(res) as Record<string, unknown>;
    const rates = (body.summary as Record<string, unknown>).rates as Record<string, unknown>;
    expect(rates.creator_pct).toBe(0.01);
    expect(rates.house_on_losers_pct).toBe(0.10);
    expect(rates.withdrawal_fee_pct).toBe(0.05);
  });

  it("fee rates are correct for CLT pool (house 8%, creator 1%)", async () => {
    setupPoolResolve(adminAuthedMock(ADMIN_WALLET), { ...CLOSED_POOL, bet_token: "clawdtrust" }, BETS_MIXED);
    const res = await postPools(makeRequest({ action: "resolve", marketId: "pool-001", winning_option_id: "opt-yes" }));
    const body = await json(res) as Record<string, unknown>;
    const rates = (body.summary as Record<string, unknown>).rates as Record<string, unknown>;
    expect(rates.house_on_losers_pct).toBe(0.08);
  });

  // ── All-on-winner: refund case ─────────────────────────────────────────────

  it("returns refund:true when all bets are on the winning option", async () => {
    setupPoolResolve(adminAuthedMock(ADMIN_WALLET), CLOSED_POOL, BETS_ALL_WINNERS);
    const res = await postPools(makeRequest({ action: "resolve", marketId: "pool-001", winning_option_id: "opt-yes" }));
    expect(res.status).toBe(200);
    const body = await json(res) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.refund).toBe(true);
    const summary = body.summary as Record<string, unknown>;
    expect(summary.refunded_count).toBe(2);
  });

  // ── No winners: house keeps pool ──────────────────────────────────────────

  it("returns 200 with 0 winners when nobody bet on winning option", async () => {
    // opt-yes wins, but nobody bet opt-yes (all bet opt-no)
    setupPoolResolve(adminAuthedMock(ADMIN_WALLET), CLOSED_POOL, BETS_NO_WINNERS);
    const res = await postPools(makeRequest({ action: "resolve", marketId: "pool-001", winning_option_id: "opt-yes" }));
    expect(res.status).toBe(200);
    const body = await json(res) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.refund).toBe(false);
    const summary = body.summary as Record<string, unknown>;
    expect(summary.winner_count).toBe(0);
    expect(summary.loser_count).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/admin/markets  — action: "resolve"  (prediction markets)
// ═════════════════════════════════════════════════════════════════════════════

describe("POST /api/admin/markets — action: resolve", () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Admin guard ───────────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    setupPredictionResolve(unauthedMock());
    const res = await postMarkets(makeRequest({ action: "resolve", marketId: "pred-001", outcomeId: "outcome-yes" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated but not admin", async () => {
    setupPredictionResolve(nonAdminMock());
    const res = await postMarkets(makeRequest({ action: "resolve", marketId: "pred-001", outcomeId: "outcome-yes" }));
    expect(res.status).toBe(403);
  });

  // ── Input validation ──────────────────────────────────────────────────────

  it("returns 400 when marketId is missing", async () => {
    setupPredictionResolve(adminAuthedMock(ADMIN_WALLET));
    const res = await postMarkets(makeRequest({ action: "resolve", outcomeId: "outcome-yes" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/marketId/i);
  });

  it("returns 400 when outcomeId is missing", async () => {
    setupPredictionResolve(adminAuthedMock(ADMIN_WALLET));
    const res = await postMarkets(makeRequest({ action: "resolve", marketId: "pred-001" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/outcomeId/i);
  });

  // ── Atomic guard: already resolved ───────────────────────────────────────

  it("returns 409 when market is already resolved (atomic guard)", async () => {
    // Empty array means the .eq("is_resolved", false) filter matched nothing
    setupPredictionResolve(adminAuthedMock(ADMIN_WALLET), []);
    const res = await postMarkets(makeRequest({ action: "resolve", marketId: "pred-001", outcomeId: "outcome-yes" }));
    expect(res.status).toBe(409);
    expect((await json(res)).error).toMatch(/already resolved/i);
  });

  // ── Success ───────────────────────────────────────────────────────────────

  it("returns 200 and ok:true on successful resolution", async () => {
    setupPredictionResolve(adminAuthedMock(ADMIN_WALLET));
    const res = await postMarkets(makeRequest({ action: "resolve", marketId: "pred-001", outcomeId: "outcome-yes" }));
    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);
  });

  // ── Unknown action ────────────────────────────────────────────────────────

  it("returns 400 for unknown action", async () => {
    setupPredictionResolve(adminAuthedMock(ADMIN_WALLET));
    const res = await postMarkets(makeRequest({ action: "banana", marketId: "pred-001" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/unknown action/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/admin/pools  — action: "cancel"
// ═════════════════════════════════════════════════════════════════════════════

describe("POST /api/admin/pools — action: cancel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when market is 'pending' (cannot cancel)", async () => {
    setupPoolResolve(adminAuthedMock(ADMIN_WALLET), { ...CLOSED_POOL, status: "pending" });
    const res = await postPools(makeRequest({ action: "cancel", marketId: "pool-001" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/active or closed/i);
  });

  it("returns 200 and refunds all approved bets on cancel", async () => {
    setupPoolResolve(adminAuthedMock(ADMIN_WALLET), { ...CLOSED_POOL, status: "active" }, BETS_MIXED);
    const res = await postPools(makeRequest({ action: "cancel", marketId: "pool-001" }));
    expect(res.status).toBe(200);
    const body = await json(res) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.refunded).toBe(3);
  });

  it("returns 404 when market does not exist on cancel", async () => {
    setupPoolResolve(adminAuthedMock(ADMIN_WALLET), null);
    const res = await postPools(makeRequest({ action: "cancel", marketId: "pool-001" }));
    expect(res.status).toBe(404);
  });
});
