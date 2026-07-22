import { describe, it, expect, vi, beforeEach } from "vitest";
import { authedMock, unauthedMock, makeGetRequest, json, SupaMockBuilder } from "./helpers";

const mockCreateClient      = vi.fn();
const mockCreateAdminClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient:      mockCreateClient,
  createAdminClient: mockCreateAdminClient,
}));

const { GET } = await import("../app/api/balance/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build an admin mock that returns specific table data for each source table */
function buildBalanceMock(wallet: string, overrides: {
  predHistory?: unknown[];
  referralComm?: unknown[];
  updownBets?:  unknown[];
  mutuelBets?:  unknown[];
  withdrawals?: unknown[];
} = {}) {
  const adminMock = new SupaMockBuilder()
    .setUser({ wallet_address: wallet })
    .returnFor("prediction_history_with_status", {
      data: overrides.predHistory ?? [],
      error: null,
    })
    .returnFor("referral_commissions", {
      data: overrides.referralComm ?? [],
      error: null,
    })
    .returnFor("updown_bets", {
      data: overrides.updownBets ?? [],
      error: null,
    })
    .returnFor("mutuel_bets", {
      data: overrides.mutuelBets ?? [],
      error: null,
    })
    .returnFor("withdrawal_requests", {
      data: overrides.withdrawals ?? [],
      error: null,
    });
  return adminMock;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/balance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const userMock = unauthedMock();
    mockCreateClient.mockImplementation(userMock.buildAsyncFactory());
    const res = await GET();
    expect(res.status).toBe(401);
    expect((await json(res)).error).toMatch(/not authenticated/i);
  });

  it("returns 0 balances when user has no activity", async () => {
    const wallet = "wallet_empty";
    const userMock  = authedMock(wallet);
    const adminMock = buildBalanceMock(wallet);
    mockCreateClient.mockImplementation(userMock.buildAsyncFactory());
    mockCreateAdminClient.mockImplementation(adminMock.buildSyncFactory());

    const res  = await GET();
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.usdcBalance).toBe(0);
    expect(body.cltBalance).toBe(0);
  });

  it("sums USDC winnings from updown bets correctly", async () => {
    const wallet = "wallet_updown";
    const userMock  = authedMock(wallet);
    const adminMock = buildBalanceMock(wallet, {
      updownBets: [
        { token: "usdc", payout: 15 },
        { token: "usdc", payout: 10 },
      ],
    });
    mockCreateClient.mockImplementation(userMock.buildAsyncFactory());
    mockCreateAdminClient.mockImplementation(adminMock.buildSyncFactory());

    const res  = await GET();
    const body = await json(res);
    expect(body.usdcBalance).toBe(25);
  });

  it("sums CLT winnings from mutuel bets correctly", async () => {
    const wallet = "wallet_clt";
    const userMock  = authedMock(wallet);
    const adminMock = buildBalanceMock(wallet, {
      mutuelBets: [
        { token: "clawdtrust", payout_amount: 200_000 },
        { token: "clawdtrust", payout_amount: 300_000 },
      ],
    });
    mockCreateClient.mockImplementation(userMock.buildAsyncFactory());
    mockCreateAdminClient.mockImplementation(adminMock.buildSyncFactory());

    const res  = await GET();
    const body = await json(res);
    expect(body.cltBalance).toBe(500_000);
  });

  it("deducts pending withdrawals from USDC balance", async () => {
    const wallet = "wallet_withdraw";
    const userMock  = authedMock(wallet);
    const adminMock = buildBalanceMock(wallet, {
      updownBets: [{ token: "usdc", payout: 50 }],
      withdrawals: [{ token: "usdc", amount: 20, status: "pending" }],
    });
    mockCreateClient.mockImplementation(userMock.buildAsyncFactory());
    mockCreateAdminClient.mockImplementation(adminMock.buildSyncFactory());

    const res  = await GET();
    const body = await json(res);
    expect(body.usdcBalance).toBe(30);
  });

  it("clamps balance to 0 when withdrawals exceed winnings", async () => {
    const wallet = "wallet_overclaimed";
    const userMock  = authedMock(wallet);
    const adminMock = buildBalanceMock(wallet, {
      updownBets: [{ token: "usdc", payout: 10 }],
      withdrawals: [{ token: "usdc", amount: 100, status: "paid" }],
    });
    mockCreateClient.mockImplementation(userMock.buildAsyncFactory());
    mockCreateAdminClient.mockImplementation(adminMock.buildSyncFactory());

    const res  = await GET();
    const body = await json(res);
    expect(body.usdcBalance).toBe(0);
  });

  it("sums prediction market winnings (result_status=win)", async () => {
    const wallet = "wallet_pred";
    const userMock  = authedMock(wallet);
    const adminMock = buildBalanceMock(wallet, {
      predHistory: [
        { token: "usdc", net_reward: 20, result_status: "win" },
        { token: "usdc", net_reward: 5,  result_status: "loss" }, // should NOT count
      ],
    });
    mockCreateClient.mockImplementation(userMock.buildAsyncFactory());
    mockCreateAdminClient.mockImplementation(adminMock.buildSyncFactory());

    const res  = await GET();
    const body = await json(res);
    expect(body.usdcBalance).toBe(20); // only the win
  });

  it("combines multiple USDC sources", async () => {
    const wallet = "wallet_combo";
    const userMock  = authedMock(wallet);
    const adminMock = buildBalanceMock(wallet, {
      predHistory: [{ token: "usdc", net_reward: 10, result_status: "win" }],
      updownBets:  [{ token: "usdc", payout: 15 }],
      mutuelBets:  [{ token: "usdc", payout_amount: 5 }],
      withdrawals: [{ token: "usdc", amount: 8, status: "paid" }],
    });
    mockCreateClient.mockImplementation(userMock.buildAsyncFactory());
    mockCreateAdminClient.mockImplementation(adminMock.buildSyncFactory());

    const res  = await GET();
    const body = await json(res);
    expect(body.usdcBalance).toBe(22); // 10+15+5-8
  });
});
