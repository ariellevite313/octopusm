/**
 * Tests for:
 *  - GET  /api/admin/pools/claims   (list pending claim payouts)
 *  - POST /api/admin/pools/claims   (mark claim as paid — atomic guard)
 *  - POST /api/admin/pools/bets     (approve / reject a pool bet)
 *
 * OCTO rewards:
 *  Bet placement:
 *    /api/updown/bet        → awardOcto()  (tested in api.bets.test.ts)
 *    /api/markets/predict   → awardOcto()  (tested in api.bets.test.ts)
 *    /api/pools/predict     → awardOcto()  (tested in api.pools.predict.test.ts)
 *  Bet approval by admin:
 *    /api/admin/pools/bets  → direct octo_transactions INSERT (tested here)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  adminAuthedMock,
  nonAdminMock,
  unauthedMock,
  makeRequest,
  makeGetRequest,
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
const { GET: getClaims, POST: postClaims } = await import("../app/api/admin/pools/claims/route");
const { POST: postBets }                   = await import("../app/api/admin/pools/bets/route");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ADMIN_WALLET = "AdminWalletABC";

const PENDING_BET = {
  id:             "bet-001",
  market_id:      "market-001",
  wallet_address: "UserWallet",
  option_id:      "opt-yes",
  amount:         50,
  token:          "usdc",
  status:         "pending",
};

// ── Setup helpers ─────────────────────────────────────────────────────────────

/**
 * Returns the admin Supabase client so tests can assert on .from() calls.
 */
function setupClaims(
  userMockBuilder: SupaMockBuilder,
  claimsData: unknown[] = [{ id: "bet-001" }],
) {
  const adminMock = new SupaMockBuilder()
    .returnFor("mutuel_bets", { data: claimsData, error: null });

  const adminClient = adminMock.buildClient();
  mockCreateClient.mockImplementation(userMockBuilder.buildAsyncFactory());
  mockCreateAdminClient.mockImplementation(() => adminClient);
  return adminClient;
}

function setupBets(
  userMockBuilder: SupaMockBuilder,
  bet: unknown = PENDING_BET,
  atomicRows: unknown[] = [{ id: "bet-001" }],
) {
  const adminMock = new SupaMockBuilder()
    .returnFor("mutuel_bets",      { data: bet ? [bet] : [], error: null })
    .returnFor("octo_transactions", { data: [], error: null });

  // Override atomic lock: after single() is called, chain await should return atomicRows.
  // We reuse the same table entry — single() unpacks [0], chain.then returns full result.
  // For the atomic lock test (empty = 409) we set mutuel_bets to empty.
  // But that also makes single() return null → 404, not 409. So we handle this differently:
  // The atomicRows override only matters when the bet exists.
  // We provide a custom adminMock that has mutuel_bets returning bet for single()
  // and the chain await returns atomicRows.
  // Solution: build a custom client with two separate from() call results via call count.
  const adminClient = adminMock.buildClient();

  // Patch: on the 2nd+ call to .from("mutuel_bets"), the update().select() chain
  // should resolve to atomicRows. We override `from` to track call index.
  let betCallCount = 0;
  const originalFrom = adminClient.from.bind(adminClient);
  adminClient.from = vi.fn((table: string) => {
    if (table === "mutuel_bets") {
      betCallCount++;
      if (betCallCount === 1) {
        // First call: single() → bet lookup
        const chain = originalFrom(table);
        return chain;
      }
      // Subsequent calls: update atomic lock or reject update → return atomicRows
      const atomicMock = new SupaMockBuilder()
        .returnFor("mutuel_bets", { data: atomicRows, error: null });
      return atomicMock.buildClient().from(table);
    }
    return originalFrom(table);
  });

  mockCreateClient.mockImplementation(userMockBuilder.buildAsyncFactory());
  mockCreateAdminClient.mockImplementation(() => adminClient);
  return adminClient;
}

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/admin/pools/claims
// ═════════════════════════════════════════════════════════════════════════════

describe("GET /api/admin/pools/claims", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    setupClaims(unauthedMock());
    const res = await getClaims();
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated but not admin", async () => {
    setupClaims(nonAdminMock());
    const res = await getClaims();
    expect(res.status).toBe(403);
  });

  it("returns the list of pending claims for an admin", async () => {
    const claims = [
      { id: "bet-001", wallet_address: "W1", payout_amount: 100, claimed_at: "2026-01-01" },
      { id: "bet-002", wallet_address: "W2", payout_amount: 50,  claimed_at: "2026-01-02" },
    ];
    setupClaims(adminAuthedMock(ADMIN_WALLET), claims);
    const res = await getClaims();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
  });

  it("returns empty array when no pending claims", async () => {
    setupClaims(adminAuthedMock(ADMIN_WALLET), []);
    const res = await getClaims();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/admin/pools/claims  — mark claim as paid
// ═════════════════════════════════════════════════════════════════════════════

describe("POST /api/admin/pools/claims", () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Admin guard ───────────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    setupClaims(unauthedMock());
    const res = await postClaims(makeRequest({ betId: "bet-001" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated but not admin", async () => {
    setupClaims(nonAdminMock());
    const res = await postClaims(makeRequest({ betId: "bet-001" }));
    expect(res.status).toBe(403);
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it("returns 400 when betId is missing", async () => {
    setupClaims(adminAuthedMock(ADMIN_WALLET));
    const res = await postClaims(makeRequest({}));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/betId/i);
  });

  it("returns 400 for malformed JSON body", async () => {
    setupClaims(adminAuthedMock(ADMIN_WALLET));
    const req = new Request("https://omdot.fun/api/admin/pools/claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ bad json",
    });
    const res = await postClaims(req);
    expect(res.status).toBe(400);
  });

  // ── Atomic guard ──────────────────────────────────────────────────────────

  it("returns 409 when bet is not yet claimed or already paid (atomic guard)", async () => {
    // Empty rows mean the .not("claimed_at", "is", null).is("paid_at", null) filter matched nothing
    setupClaims(adminAuthedMock(ADMIN_WALLET), []);
    const res = await postClaims(makeRequest({ betId: "bet-001" }));
    expect(res.status).toBe(409);
    expect((await json(res)).error).toMatch(/not claimed|already paid/i);
  });

  // ── Success ───────────────────────────────────────────────────────────────

  it("returns 200 on successful mark_paid", async () => {
    setupClaims(adminAuthedMock(ADMIN_WALLET), [{ id: "bet-001" }]);
    const res = await postClaims(makeRequest({ betId: "bet-001" }));
    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);
  });

  it("accepts an optional payout_tx signature", async () => {
    setupClaims(adminAuthedMock(ADMIN_WALLET), [{ id: "bet-001" }]);
    const res = await postClaims(makeRequest({ betId: "bet-001", payout_tx: "solana-tx-abc123" }));
    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/admin/pools/bets  — approve / reject
// ═════════════════════════════════════════════════════════════════════════════

describe("POST /api/admin/pools/bets", () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Admin guard ───────────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    setupBets(unauthedMock());
    const res = await postBets(makeRequest({ action: "approve", betId: "bet-001" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated but not admin", async () => {
    setupBets(nonAdminMock());
    const res = await postBets(makeRequest({ action: "approve", betId: "bet-001" }));
    expect(res.status).toBe(403);
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it("returns 400 when betId is missing", async () => {
    setupBets(adminAuthedMock(ADMIN_WALLET));
    const res = await postBets(makeRequest({ action: "approve" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/betId/i);
  });

  it("returns 400 for unknown action", async () => {
    setupBets(adminAuthedMock(ADMIN_WALLET));
    const res = await postBets(makeRequest({ action: "banana", betId: "bet-001" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/unknown action/i);
  });

  // ── Bet not found ─────────────────────────────────────────────────────────

  it("returns 404 when bet does not exist or already processed", async () => {
    setupBets(adminAuthedMock(ADMIN_WALLET), null);
    const res = await postBets(makeRequest({ action: "approve", betId: "bet-001" }));
    expect(res.status).toBe(404);
    expect((await json(res)).error).toMatch(/not found|already processed/i);
  });

  // ── Reject ────────────────────────────────────────────────────────────────

  it("returns 200 on successful reject", async () => {
    setupBets(adminAuthedMock(ADMIN_WALLET));
    const res = await postBets(makeRequest({ action: "reject", betId: "bet-001" }));
    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);
  });

  // ── Approve ───────────────────────────────────────────────────────────────

  it("returns 200 on successful approve", async () => {
    setupBets(adminAuthedMock(ADMIN_WALLET));
    const res = await postBets(makeRequest({ action: "approve", betId: "bet-001" }));
    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);
  });

  it("inserts OCTO reward into octo_transactions when bet is approved", async () => {
    const adminClient = setupBets(adminAuthedMock(ADMIN_WALLET));
    await postBets(makeRequest({ action: "approve", betId: "bet-001" }));

    // Verify from("octo_transactions") was called (= OCTO insert attempted)
    const fromCalls = (adminClient.from as ReturnType<typeof vi.fn>).mock.calls
      .map((args: unknown[]) => args[0]);
    expect(fromCalls).toContain("octo_transactions");
  });

  it("calls increment_pool_total RPC when bet is approved", async () => {
    const adminClient = setupBets(adminAuthedMock(ADMIN_WALLET));
    await postBets(makeRequest({ action: "approve", betId: "bet-001" }));

    expect(adminClient.rpc).toHaveBeenCalledWith(
      "increment_pool_total",
      expect.objectContaining({ p_market_id: PENDING_BET.market_id }),
    );
  });

  it("does NOT call increment_pool_total when bet is rejected", async () => {
    const adminClient = setupBets(adminAuthedMock(ADMIN_WALLET));
    await postBets(makeRequest({ action: "reject", betId: "bet-001" }));

    expect(adminClient.rpc).not.toHaveBeenCalled();
  });

  it("does NOT insert OCTO when bet is rejected", async () => {
    const adminClient = setupBets(adminAuthedMock(ADMIN_WALLET));
    await postBets(makeRequest({ action: "reject", betId: "bet-001" }));

    const fromCalls = (adminClient.from as ReturnType<typeof vi.fn>).mock.calls
      .map((args: unknown[]) => args[0]);
    expect(fromCalls).not.toContain("octo_transactions");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// OCTO reward coverage summary
// ═════════════════════════════════════════════════════════════════════════════
//
// Market type         | Route                     | OCTO mechanism          | Tested in
// --------------------|---------------------------|-------------------------|---------------------------
// Pool (mutuel)       | POST /api/pools/predict   | awardOcto()             | api.pools.predict.test.ts
// Up/Down             | POST /api/updown/bet      | awardOcto()             | api.bets.test.ts
// Prediction (classic)| POST /api/markets/predict | awardOcto()             | api.bets.test.ts
// Pool approval       | POST /api/admin/pools/bets| octo_transactions INSERT| this file (above)
