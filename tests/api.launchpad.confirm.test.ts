/**
 * Tests for POST /api/launchpad/[id]/confirm
 *
 * Covers:
 *  1. Input validation (missing fields)
 *  2. Authorization (token not found, wrong wallet, already confirmed)
 *  3. TX confirmation logic — key cleared only when confirmed
 *  4. Scheduled vs immediate token behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { json } from "./helpers";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const { mockCreateAdminClient, mockVerifyTransaction } = vi.hoisted(() => ({
  mockCreateAdminClient: vi.fn(),
  mockVerifyTransaction:  vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient:      vi.fn(),
  createAdminClient: mockCreateAdminClient,
}));

// Mock verifyTransaction directly — avoids @solana/web3.js Connection issues
// and makes the SOLANA_RPC_URL env-var irrelevant for tests.
vi.mock("@/lib/solana/verify-tx", () => ({
  verifyTransaction: mockVerifyTransaction,
}));

// ── Route handler ─────────────────────────────────────────────────────────────

const { POST: postConfirm } = await import("../app/api/launchpad/[id]/confirm/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROUTE_PARAMS = { params: Promise.resolve({ id: "token-uuid-123" }) };

function makeRequest(body: object): Request {
  return new Request("https://omdot.fun/api/launchpad/token-uuid-123/confirm", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
}

/** Build an admin client mock where launchpad_tokens returns the given token */
function buildAdminMock(token: object | null, updateFn = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })) {
  const maybeSingleResult = { data: token, error: null };
  const client = {
    from: vi.fn(() => ({
      select:      vi.fn().mockReturnThis(),
      eq:          vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue(maybeSingleResult),
      update:      updateFn,
    })),
  };
  return { client, updateFn };
}

// ── Fixture ───────────────────────────────────────────────────────────────────

const PENDING_TOKEN = {
  status:         "pending",
  creator_wallet: "CreatorWallet111",
  is_scheduled:   false,
  scheduled_at:   null,
};

// ══════════════════════════════════════════════════════════════════════════════
// 1. Input validation
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /api/launchpad/[id]/confirm — input validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when txSignature is missing", async () => {
    const res = await postConfirm(makeRequest({ walletAddress: "CreatorWallet111" }), ROUTE_PARAMS);
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/txSignature/i);
  });

  it("returns 400 when walletAddress is missing", async () => {
    const res = await postConfirm(makeRequest({ txSignature: "sig123" }), ROUTE_PARAMS);
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/walletAddress/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Authorization
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /api/launchpad/[id]/confirm — authorization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when token does not exist", async () => {
    const { client } = buildAdminMock(null);
    mockCreateAdminClient.mockReturnValue(client);

    const res = await postConfirm(
      makeRequest({ txSignature: "sig", walletAddress: "any" }),
      ROUTE_PARAMS
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when walletAddress does not match creator_wallet", async () => {
    const { client } = buildAdminMock(PENDING_TOKEN);
    mockCreateAdminClient.mockReturnValue(client);

    const res = await postConfirm(
      makeRequest({ txSignature: "sig", walletAddress: "OtherWallet" }),
      ROUTE_PARAMS
    );
    expect(res.status).toBe(403);
    expect((await json(res)).error).toMatch(/unauthorized/i);
  });

  it("returns 409 when token status is not pending", async () => {
    const { client } = buildAdminMock({ ...PENDING_TOKEN, status: "active" });
    mockCreateAdminClient.mockReturnValue(client);

    const res = await postConfirm(
      makeRequest({ txSignature: "sig", walletAddress: "CreatorWallet111" }),
      ROUTE_PARAMS
    );
    expect(res.status).toBe(409);
    expect((await json(res)).error).toMatch(/already confirmed/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. TX confirmation logic — vanity_secret_key cleared only when confirmed
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /api/launchpad/[id]/confirm — key clearing", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it("clears vanity_secret_key when TX is confirmed on first check", async () => {
    mockVerifyTransaction.mockResolvedValue(true);

    const { client, updateFn } = buildAdminMock(PENDING_TOKEN);
    mockCreateAdminClient.mockReturnValue(client);

    const res = await postConfirm(
      makeRequest({ txSignature: "confirmedSig", walletAddress: "CreatorWallet111" }),
      ROUTE_PARAMS
    );

    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);

    const updateArg = updateFn.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg).toHaveProperty("vanity_secret_key", null);
    expect(updateArg).toHaveProperty("status", "active");
  });

  it("does NOT clear vanity_secret_key when TX is not confirmed after retry", async () => {
    vi.useFakeTimers();
    // Both checks return false
    mockVerifyTransaction.mockResolvedValue(false);

    const { client, updateFn } = buildAdminMock(PENDING_TOKEN);
    mockCreateAdminClient.mockReturnValue(client);

    const responsePromise = postConfirm(
      makeRequest({ txSignature: "unconfirmedSig", walletAddress: "CreatorWallet111" }),
      ROUTE_PARAMS
    );

    // Advance past the 4s retry delay
    await vi.runAllTimersAsync();
    const res = await responsePromise;

    expect(res.status).toBe(200);
    const updateArg = updateFn.mock.calls[0][0] as Record<string, unknown>;
    // vanity_secret_key must NOT be cleared (key preserved for retry)
    expect(updateArg).not.toHaveProperty("vanity_secret_key");
    expect(updateArg).toHaveProperty("status", "active");
  });

  it("clears vanity_secret_key when TX is confirmed on retry (second check)", async () => {
    vi.useFakeTimers();
    // First call not confirmed, second call confirmed
    mockVerifyTransaction
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const { client, updateFn } = buildAdminMock(PENDING_TOKEN);
    mockCreateAdminClient.mockReturnValue(client);

    const responsePromise = postConfirm(
      makeRequest({ txSignature: "lateSig", walletAddress: "CreatorWallet111" }),
      ROUTE_PARAMS
    );

    await vi.runAllTimersAsync();
    const res = await responsePromise;

    expect(res.status).toBe(200);
    const updateArg = updateFn.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg).toHaveProperty("vanity_secret_key", null);
  });

  it("treats a TX with err field as unconfirmed", async () => {
    vi.useFakeTimers();
    // verifyTransaction already handles err internally and returns false
    mockVerifyTransaction.mockResolvedValue(false);

    const { client, updateFn } = buildAdminMock(PENDING_TOKEN);
    mockCreateAdminClient.mockReturnValue(client);

    const responsePromise = postConfirm(
      makeRequest({ txSignature: "failedSig", walletAddress: "CreatorWallet111" }),
      ROUTE_PARAMS
    );
    await vi.runAllTimersAsync();
    await responsePromise;

    const updateArg = updateFn.mock.calls[0][0] as Record<string, unknown>;
    // Key must be preserved because tx has an on-chain error
    expect(updateArg).not.toHaveProperty("vanity_secret_key");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Scheduled vs immediate token
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /api/launchpad/[id]/confirm — scheduled tokens", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets is_tradeable=false for scheduled tokens", async () => {
    mockVerifyTransaction.mockResolvedValue(true);

    const scheduledToken = {
      ...PENDING_TOKEN,
      is_scheduled: true,
      scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
    };

    const { client, updateFn } = buildAdminMock(scheduledToken);
    mockCreateAdminClient.mockReturnValue(client);

    const res = await postConfirm(
      makeRequest({ txSignature: "sig", walletAddress: "CreatorWallet111" }),
      ROUTE_PARAMS
    );

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.isTradeable).toBe(false);

    const updateArg = updateFn.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg.is_tradeable).toBe(false);
  });

  it("sets is_tradeable=true for immediate (non-scheduled) tokens", async () => {
    mockVerifyTransaction.mockResolvedValue(true);

    const { client, updateFn } = buildAdminMock(PENDING_TOKEN);
    mockCreateAdminClient.mockReturnValue(client);

    const res = await postConfirm(
      makeRequest({ txSignature: "sig", walletAddress: "CreatorWallet111" }),
      ROUTE_PARAMS
    );

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.isTradeable).toBe(true);

    const updateArg = updateFn.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg.is_tradeable).toBe(true);
  });
});
