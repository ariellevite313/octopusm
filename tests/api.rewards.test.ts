/**
 * Tests for the OCTO reward system across all market types.
 *
 * Rules under test:
 *  1. Market creation  — OCTO awarded at admin APPROVAL, not at submission
 *  2. Up/Down bet      — OCTO NOT awarded at placement (pending); awarded at admin approval
 *  3. Up/Down approval — awardOcto() called (syncs leaderboard_octo)
 *  4. Pool bet (on-chain) approval  — awardOcto() called
 *  5. Pool bet (off-chain) approval — awardOcto() called
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  authedMock,
  adminAuthedMock,
  nonAdminMock,
  unauthedMock,
  makeRequest,
  json,
  SupaMockBuilder,
} from "./helpers";

// ── Shared mocks ──────────────────────────────────────────────────────────────

const mockCreateClient      = vi.fn();
const mockCreateAdminClient = vi.fn();
const mockAwardOcto         = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/supabase/server", () => ({
  createClient:      mockCreateClient,
  createAdminClient: mockCreateAdminClient,
}));
vi.mock("@/lib/octo", () => ({
  awardOcto:         mockAwardOcto,
  octoForBet:        vi.fn().mockReturnValue(10),
  OCTO_PER_CREATION: 100,
  OCTO_PER_BET:      5,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/categories", () => ({
  CATEGORY_SLUGS: ["crypto", "sports", "politics"],
}));

// ── Route handlers ────────────────────────────────────────────────────────────

const { POST: postPools }            = await import("../app/api/pools/route");
const { POST: postAdminPools }       = await import("../app/api/admin/pools/route");
const { POST: postUpDownBet }        = await import("../app/api/updown/bet/route");
const { POST: postAdminUpDownBets }  = await import("../app/api/admin/updown/bets/route");
const { POST: postAdminPoolsBets }   = await import("../app/api/admin/pools/bets/route");
const { POST: postAdminPoolsPreds }  = await import("../app/api/admin/pools/predictions/route");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CREATOR_WALLET = "CreatorWallet111";
const BETTOR_WALLET  = "BettorWallet222";
const ADMIN_WALLET   = "AdminWallet333";

const VALID_POOL_BODY = {
  title:             "Will BTC hit 100k?",
  description:       "A crypto pool",
  cover_image_src:   null,
  options:           [{ label: "Yes" }, { label: "No" }],
  category:          "crypto",
  bet_token:         "usdc",
  betting_closes_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
};

const UPDOWN_BODY = {
  market_id:      "updown-market-001",
  wallet_address: BETTOR_WALLET,
  direction:      "up" as const,
  amount:         10,
  tx_signature:   "txABC123",
};

const OPEN_UPDOWN_MARKET = {
  id:        "updown-market-001",
  status:    "open",
  closes_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
};

const PENDING_UPDOWN_BET = {
  id:             "updown-bet-001",
  market_id:      "updown-market-001",
  wallet_address: BETTOR_WALLET,
  direction:      "up",
  amount:         10,
  status:         "pending",
  updown_markets: { status: "open" },
};

const PENDING_POOL_BET = {
  id:             "pool-bet-001",
  market_id:      "pool-market-001",
  wallet_address: BETTOR_WALLET,
  option_id:      "opt-yes",
  amount:         50,
  token:          "usdc",
  status:         "pending",
};

const PENDING_PAYMENT = {
  id:            "payment-001",
  market_id:     "pool-market-001",
  selection_id:  "opt-yes",
  user_wallet:   BETTOR_WALLET,
  amount_usdc:   20,
  token:         "usdc",
  tx_signature:  "txPAY001",
  flow:          "pool_prediction",
  status:        "pending",
};

// ═════════════════════════════════════════════════════════════════════════════
// 1. POST /api/pools — market creation
// ═════════════════════════════════════════════════════════════════════════════

describe("POST /api/pools — OCTO reward at creation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does NOT award OCTO at submission (market is pending)", async () => {
    const userMock  = authedMock(CREATOR_WALLET);
    const adminMock = new SupaMockBuilder()
      .returnFor("mutuel_markets", {
        data:  [{ id: "new-id", slug: "test-slug", title: VALID_POOL_BODY.title }],
        error: null,
      });

    mockCreateClient.mockImplementation(userMock.buildAsyncFactory());
    mockCreateAdminClient.mockImplementation(adminMock.buildSyncFactory());

    const res = await postPools(makeRequest(VALID_POOL_BODY));
    expect(res.status).toBe(201);
    expect(mockAwardOcto).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. POST /api/admin/pools — market approval
// ═════════════════════════════════════════════════════════════════════════════

describe("POST /api/admin/pools (action=approve) — OCTO reward at approval", () => {
  beforeEach(() => vi.clearAllMocks());

  function setupAdminPools(market: { creator_wallet: string } | null) {
    const userMock  = adminAuthedMock(ADMIN_WALLET);
    const adminMock = new SupaMockBuilder()
      .setRpc("is_admin", true)
      .returnFor("mutuel_markets", {
        data:  market ? [market] : [],
        error: null,
      });

    mockCreateClient.mockImplementation(userMock.buildAsyncFactory());
    mockCreateAdminClient.mockImplementation(adminMock.buildSyncFactory());
  }

  it("awards OCTO to the creator when market is approved", async () => {
    setupAdminPools({ creator_wallet: CREATOR_WALLET });

    const res = await postAdminPools(
      makeRequest({ action: "approve", marketId: "market-001" })
    );
    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);

    // Give fire-and-forget time to settle
    await vi.runAllTimersAsync().catch(() => {});
    await Promise.resolve();

    expect(mockAwardOcto).toHaveBeenCalledWith(
      CREATOR_WALLET,
      100,
      "task",
    );
  });

  it("does NOT award OCTO if market has no creator_wallet", async () => {
    setupAdminPools({ creator_wallet: "" });

    await postAdminPools(makeRequest({ action: "approve", marketId: "market-001" }));
    await Promise.resolve();

    expect(mockAwardOcto).not.toHaveBeenCalled();
  });

  it("does NOT award OCTO on reject", async () => {
    setupAdminPools({ creator_wallet: CREATOR_WALLET });

    await postAdminPools(
      makeRequest({ action: "reject", marketId: "market-001", reason: "Duplicate market" })
    );
    await Promise.resolve();

    expect(mockAwardOcto).not.toHaveBeenCalled();
  });

  it("returns 401 for non-admin", async () => {
    const userMock  = nonAdminMock();
    const adminMock = new SupaMockBuilder().setRpc("is_admin", false);
    mockCreateClient.mockImplementation(userMock.buildAsyncFactory());
    mockCreateAdminClient.mockImplementation(adminMock.buildSyncFactory());

    const res = await postAdminPools(
      makeRequest({ action: "approve", marketId: "market-001" })
    );
    expect(res.status).toBe(403);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. POST /api/updown/bet — no OCTO at placement
// ═════════════════════════════════════════════════════════════════════════════

describe("POST /api/updown/bet — no OCTO at placement", () => {
  beforeEach(() => vi.clearAllMocks());

  function setupUpDown() {
    const userMock  = authedMock(BETTOR_WALLET);
    const adminMock = new SupaMockBuilder()
      .returnFor("updown_markets", { data: [OPEN_UPDOWN_MARKET], error: null })
      .returnFor("updown_bets",    { data: null, error: null });

    mockCreateClient.mockImplementation(userMock.buildAsyncFactory());
    mockCreateAdminClient.mockImplementation(adminMock.buildSyncFactory());
  }

  it("returns 200 ok on valid bet placement", async () => {
    setupUpDown();
    const res = await postUpDownBet(makeRequest(UPDOWN_BODY));
    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);
  });

  it("does NOT call awardOcto at placement — bet is still pending", async () => {
    setupUpDown();
    await postUpDownBet(makeRequest(UPDOWN_BODY));
    await Promise.resolve();
    expect(mockAwardOcto).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. POST /api/admin/updown/bets — OCTO via awardOcto at approval
// ═════════════════════════════════════════════════════════════════════════════

describe("POST /api/admin/updown/bets (action=approve) — OCTO via awardOcto", () => {
  beforeEach(() => vi.clearAllMocks());

  function setupAdminUpDownBets(bet: unknown = PENDING_UPDOWN_BET) {
    const userMock  = adminAuthedMock(ADMIN_WALLET);
    const adminMock = new SupaMockBuilder()
      .setRpc("is_admin",              true)
      .setRpc("increment_updown_pool", null)
      .returnFor("updown_bets", { data: bet ? [bet] : [], error: null });

    mockCreateClient.mockImplementation(userMock.buildAsyncFactory());
    mockCreateAdminClient.mockImplementation(adminMock.buildSyncFactory());
  }

  it("calls awardOcto with bettor wallet after approval", async () => {
    setupAdminUpDownBets();

    const res = await postAdminUpDownBets(
      makeRequest({ bet_id: "updown-bet-001", action: "approve" })
    );
    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);

    await Promise.resolve();
    expect(mockAwardOcto).toHaveBeenCalledWith(BETTOR_WALLET, 5, "bet");
  });

  it("does NOT call awardOcto on reject", async () => {
    setupAdminUpDownBets();

    await postAdminUpDownBets(
      makeRequest({ bet_id: "updown-bet-001", action: "reject" })
    );
    await Promise.resolve();
    expect(mockAwardOcto).not.toHaveBeenCalled();
  });

  it("returns 404 when bet not found", async () => {
    setupAdminUpDownBets(null);
    const res = await postAdminUpDownBets(
      makeRequest({ bet_id: "missing-bet", action: "approve" })
    );
    expect(res.status).toBe(404);
    expect(mockAwardOcto).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. POST /api/admin/pools/bets (on-chain) — OCTO via awardOcto at approval
// ═════════════════════════════════════════════════════════════════════════════

describe("POST /api/admin/pools/bets (action=approve) — OCTO via awardOcto", () => {
  beforeEach(() => vi.clearAllMocks());

  function setupAdminPoolsBets(bet: unknown = PENDING_POOL_BET, atomicRows: unknown[] = [{ id: "pool-bet-001" }]) {
    const userMock  = adminAuthedMock(ADMIN_WALLET);
    const adminMock = new SupaMockBuilder()
      .setRpc("is_admin",           true)
      .setRpc("increment_pool_total", null)
      .returnFor("mutuel_bets", { data: bet ? [bet] : [], error: null });

    const adminClient = adminMock.buildClient();

    // Patch: first mutuel_bets call is single() fetch, second is atomic lock update
    let betCallCount = 0;
    const originalFrom = adminClient.from.bind(adminClient);
    adminClient.from = vi.fn((table: string) => {
      if (table === "mutuel_bets") {
        betCallCount++;
        if (betCallCount >= 2) {
          // Atomic lock call — return atomicRows
          const chain: Record<string, unknown> = {};
          const chainFn = () => chain;
          chain.update = vi.fn(chainFn);
          chain.eq     = vi.fn(chainFn);
          chain.select = vi.fn(chainFn);
          Object.defineProperty(chain, "then", {
            get() {
              return (resolve: (v: unknown) => void) =>
                resolve({ data: atomicRows, error: null });
            },
          });
          return chain;
        }
      }
      return originalFrom(table);
    });

    mockCreateClient.mockImplementation(userMock.buildAsyncFactory());
    mockCreateAdminClient.mockImplementation(() => adminClient);
  }

  it("calls awardOcto with bettor wallet after approval", async () => {
    setupAdminPoolsBets();

    const res = await postAdminPoolsBets(
      makeRequest({ action: "approve", betId: "pool-bet-001" })
    );
    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);

    await Promise.resolve();
    expect(mockAwardOcto).toHaveBeenCalledWith(BETTOR_WALLET, 5, "bet");
  });

  it("does NOT call awardOcto on reject", async () => {
    setupAdminPoolsBets();

    await postAdminPoolsBets(
      makeRequest({ action: "reject", betId: "pool-bet-001" })
    );
    await Promise.resolve();
    expect(mockAwardOcto).not.toHaveBeenCalled();
  });

  it("does NOT call awardOcto when atomic lock fails (already processed)", async () => {
    setupAdminPoolsBets(PENDING_POOL_BET, []); // empty rows = already processed

    const res = await postAdminPoolsBets(
      makeRequest({ action: "approve", betId: "pool-bet-001" })
    );
    expect(res.status).toBe(409);
    expect(mockAwardOcto).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. POST /api/admin/pools/predictions (off-chain) — OCTO via awardOcto
// ═════════════════════════════════════════════════════════════════════════════

describe("POST /api/admin/pools/predictions (action=approve) — OCTO via awardOcto", () => {
  beforeEach(() => vi.clearAllMocks());

  const VALID_MARKET = {
    id:             "pool-market-001",
    status:         "active",
    options:        [{ id: "opt-yes" }],
    bet_token:      "usdc",
    total_pool_usdc: 0,
    total_pool_clt:  0,
    bet_count:       0,
  };

  function setupAdminPoolsPreds(payment: unknown = PENDING_PAYMENT) {
    const userMock  = adminAuthedMock(ADMIN_WALLET);
    const adminMock = new SupaMockBuilder()
      .setRpc("is_admin", true)
      .returnFor("payments",       { data: payment ? [payment] : [], error: null })
      .returnFor("mutuel_markets", { data: [VALID_MARKET], error: null })
      .returnFor("mutuel_bets",    { data: null, error: null });

    const adminClient = adminMock.buildClient();

    // Patch: only the 2nd payments call (atomic lock) returns the locked row.
    // Call 1 = fetch payment (single), call 2 = atomic lock, call 3 = dedup check.
    let paymentCallCount = 0;
    const originalFrom = adminClient.from.bind(adminClient);
    adminClient.from = vi.fn((table: string) => {
      if (table === "payments") {
        paymentCallCount++;
        if (paymentCallCount === 2) {
          // Atomic lock update — return the row so the lock succeeds
          const chain: Record<string, unknown> = {};
          const chainFn = () => chain;
          chain.update = vi.fn(chainFn);
          chain.eq     = vi.fn(chainFn);
          chain.select = vi.fn(chainFn);
          Object.defineProperty(chain, "then", {
            get() {
              return (resolve: (v: unknown) => void) =>
                resolve({ data: [{ id: "payment-001" }], error: null });
            },
          });
          return chain;
        }
      }
      return originalFrom(table);
    });

    mockCreateClient.mockImplementation(userMock.buildAsyncFactory());
    mockCreateAdminClient.mockImplementation(() => adminClient);
  }

  it("calls awardOcto with bettor wallet after payment approval", async () => {
    setupAdminPoolsPreds();

    const res = await postAdminPoolsPreds(
      makeRequest({ action: "approve", paymentId: "payment-001" })
    );
    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);

    await Promise.resolve();
    expect(mockAwardOcto).toHaveBeenCalledWith(BETTOR_WALLET, 5, "bet");
  });

  it("does NOT call awardOcto on reject", async () => {
    setupAdminPoolsPreds();

    await postAdminPoolsPreds(
      makeRequest({ action: "reject", paymentId: "payment-001" })
    );
    await Promise.resolve();
    expect(mockAwardOcto).not.toHaveBeenCalled();
  });

  it("returns 404 when payment not found", async () => {
    setupAdminPoolsPreds(null);

    const res = await postAdminPoolsPreds(
      makeRequest({ action: "approve", paymentId: "missing-payment" })
    );
    expect(res.status).toBe(404);
    expect(mockAwardOcto).not.toHaveBeenCalled();
  });
});
