import { describe, it, expect, vi, beforeEach } from "vitest";
import { authedMock, unauthedMock, makeRequest, json, SupaMockBuilder } from "./helpers";

const mockCreateClient      = vi.fn();
const mockCreateAdminClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient:      mockCreateClient,
  createAdminClient: mockCreateAdminClient,
}));

const { POST } = await import("../app/api/withdraw/route");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const WALLET = "withdrawWallet999";

const VALID_BODY = { token: "usdc", amount: "5" };

/** Build an admin mock simulating a certain available balance */
function setupWithBalance(wallet: string, options: {
  updownPayout?: number;
  existingPending?: boolean;
  insertError?: { message: string };
} = {}) {
  const userMock = authedMock(wallet);
  const adminMock = new SupaMockBuilder()
    .setUser({ wallet_address: wallet })
    .returnFor("updown_bets", {
      data: options.updownPayout !== undefined
        ? [{ token: "usdc", payout: options.updownPayout }]
        : [],
      error: null,
    })
    .returnFor("prediction_history_with_status", { data: [], error: null })
    .returnFor("referral_commissions",            { data: [], error: null })
    .returnFor("mutuel_bets",                     { data: [], error: null })
    .returnFor("withdrawal_requests", {
      data: options.existingPending
        ? [{ id: "wr-001", status: "pending" }]
        : [],
      error: null,
    });

  if (options.insertError) {
    adminMock.returnFor("withdrawal_requests", { data: null, error: options.insertError });
  }

  mockCreateClient.mockImplementation(userMock.buildAsyncFactory());
  mockCreateAdminClient.mockImplementation(adminMock.buildSyncFactory());
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/withdraw", () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    const userMock = unauthedMock();
    mockCreateClient.mockImplementation(userMock.buildAsyncFactory());
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
    expect((await json(res)).error).toMatch(/not authenticated/i);
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it("returns 400 when token is missing", async () => {
    setupWithBalance(WALLET, { updownPayout: 50 });
    const res = await POST(makeRequest({ amount: "5" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/token/i);
  });

  it("returns 400 for invalid token", async () => {
    setupWithBalance(WALLET, { updownPayout: 50 });
    const res = await POST(makeRequest({ token: "bitcoin", amount: "5" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/token/i);
  });

  it("returns 400 when amount is missing", async () => {
    setupWithBalance(WALLET, { updownPayout: 50 });
    const res = await POST(makeRequest({ token: "usdc" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when amount is zero", async () => {
    setupWithBalance(WALLET, { updownPayout: 50 });
    const res = await POST(makeRequest({ token: "usdc", amount: "0" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when USDC amount is below minimum (< 2)", async () => {
    setupWithBalance(WALLET, { updownPayout: 50 });
    const res = await POST(makeRequest({ token: "usdc", amount: "1" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/minimum/i);
  });

  it("returns 400 when CLT amount is below minimum (< 500000)", async () => {
    setupWithBalance(WALLET, { updownPayout: 1_000_000 });
    const res = await POST(makeRequest({ token: "clawdtrust", amount: "100" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/minimum/i);
  });

  // ── Insufficient balance ──────────────────────────────────────────────────

  it("returns 400 when balance is insufficient", async () => {
    setupWithBalance(WALLET, { updownPayout: 3 }); // only $3 available
    const res = await POST(makeRequest({ token: "usdc", amount: "10" })); // asking $10
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/insufficient/i);
  });

  it("returns 400 when balance is 0", async () => {
    setupWithBalance(WALLET, { updownPayout: 0 });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/insufficient/i);
  });

  // ── Duplicate pending withdrawal ──────────────────────────────────────────

  it("returns 409 when a pending withdrawal already exists for this token", async () => {
    setupWithBalance(WALLET, { updownPayout: 100, existingPending: true });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(409);
    expect((await json(res)).error).toMatch(/pending|approved/i);
  });

  // ── JSON body ─────────────────────────────────────────────────────────────

  it("returns 400 for malformed JSON body", async () => {
    setupWithBalance(WALLET, { updownPayout: 50 });
    const req = new Request("https://omdot.fun/api/withdraw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ bad json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/json/i);
  });
});
