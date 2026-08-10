/**
 * Tests for POST /api/launchpad/[id]/confirm
 *
 * Covers:
 *  1. Input validation (missing fields)
 *  2. Authorization (token not found, wrong wallet, already confirmed)
 *  3. TX confirmation logic — key cleared only when confirmed
 *  4. Scheduled vs immediate token behavior
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { json } from "./helpers";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const { mockCreateAdminClient, mockGetSignatureStatus } = vi.hoisted(() => ({
  mockCreateAdminClient:  vi.fn(),
  mockGetSignatureStatus: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient:      vi.fn(),
  createAdminClient: mockCreateAdminClient,
}));

vi.mock("@solana/web3.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("@solana/web3.js")>();
  return {
    ...real,
    Connection: vi.fn().mockImplementation(() => ({
      getSignatureStatus: mockGetSignatureStatus,
    })),
  };
});

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
function buildAdminMock(token: object | null, updateSpy = vi.fn()) {
  const maybeSingleResult = { data: token, error: null };
  const client = {
    from: vi.fn((table: string) => {
      if (table === "launchpad_tokens") {
        return {
          select:      vi.fn().mockReturnThis(),
          eq:          vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue(maybeSingleResult),
          update:      vi.fn(() => ({ eq: updateSpy })),
        };
      }
      return {};
    }),
  };
  return client;
}

// ── Fixture ───────────────────────────────────────────────────────────────────

const PENDING_TOKEN = {
  status:           "pending",
  creator_wallet:   "CreatorWallet111",
  is_scheduled:     false,
  scheduled_at:     null,
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
    mockCreateAdminClient.mockReturnValue(buildAdminMock(null));

    const res = await postConfirm(
      makeRequest({ txSignature: "sig", walletAddress: "any" }),
      ROUTE_PARAMS
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when walletAddress does not match creator_wallet", async () => {
    mockCreateAdminClient.mockReturnValue(buildAdminMock(PENDING_TOKEN));

    const res = await postConfirm(
      makeRequest({ txSignature: "sig", walletAddress: "OtherWallet" }),
      ROUTE_PARAMS
    );
    expect(res.status).toBe(403);
    expect((await json(res)).error).toMatch(/unauthorized/i);
  });

  it("returns 409 when token status is not pending", async () => {
    mockCreateAdminClient.mockReturnValue(buildAdminMock({ ...PENDING_TOKEN, status: "active" }));

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

  it("clears vanity_secret_key when TX is confirmed on first check", async () => {
    // TX confirmed immediately
    mockGetSignatureStatus.mockResolvedValue({
      value: { err: null, confirmationStatus: "confirmed" },
    });

    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq });
    const client = {
      from: vi.fn(() => ({
        select:      vi.fn().mockReturnThis(),
        eq:          vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: PENDING_TOKEN, error: null }),
        update:      updateFn,
      })),
    };
    mockCreateAdminClient.mockReturnValue(client);

    const res = await postConfirm(
      makeRequest({ txSignature: "confirmedSig", walletAddress: "CreatorWallet111" }),
      ROUTE_PARAMS
    );

    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);

    // vanity_secret_key must be null in the update payload
    const updateArg = updateFn.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg).toHaveProperty("vanity_secret_key", null);
    expect(updateArg).toHaveProperty("status", "active");
  });

  it("does NOT clear vanity_secret_key when TX is not confirmed after retry", async () => {
    vi.useFakeTimers();

    // TX never confirms (both checks return not-confirmed)
    mockGetSignatureStatus.mockResolvedValue({ value: null });

    const updateFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const client = {
      from: vi.fn(() => ({
        select:      vi.fn().mockReturnThis(),
        eq:          vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: PENDING_TOKEN, error: null }),
        update:      updateFn,
      })),
    };
    mockCreateAdminClient.mockReturnValue(client);

    const responsePromise = postConfirm(
      makeRequest({ txSignature: "unconfirmedSig", walletAddress: "CreatorWallet111" }),
      ROUTE_PARAMS
    );

    // Advance timer past the 4s retry delay
    await vi.advanceTimersByTimeAsync(5000);
    const res = await responsePromise;

    expect(res.status).toBe(200);
    const updateArg = updateFn.mock.calls[0][0] as Record<string, unknown>;
    // vanity_secret_key must NOT be in the update payload (key preserved for retry)
    expect(updateArg).not.toHaveProperty("vanity_secret_key");
    expect(updateArg).toHaveProperty("status", "active");

    vi.useRealTimers();
  });

  it("clears vanity_secret_key when TX is confirmed on retry (second check)", async () => {
    vi.useFakeTimers();

    // First call not confirmed, second call confirmed
    mockGetSignatureStatus
      .mockResolvedValueOnce({ value: null })
      .mockResolvedValueOnce({ value: { err: null, confirmationStatus: "confirmed" } });

    const updateFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const client = {
      from: vi.fn(() => ({
        select:      vi.fn().mockReturnThis(),
        eq:          vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: PENDING_TOKEN, error: null }),
        update:      updateFn,
      })),
    };
    mockCreateAdminClient.mockReturnValue(client);

    const responsePromise = postConfirm(
      makeRequest({ txSignature: "lateSig", walletAddress: "CreatorWallet111" }),
      ROUTE_PARAMS
    );

    await vi.advanceTimersByTimeAsync(5000);
    const res = await responsePromise;

    expect(res.status).toBe(200);
    const updateArg = updateFn.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg).toHaveProperty("vanity_secret_key", null);

    vi.useRealTimers();
  });

  it("treats a TX with err field as unconfirmed", async () => {
    vi.useFakeTimers();

    // TX has an error (reverted)
    mockGetSignatureStatus.mockResolvedValue({
      value: { err: { InstructionError: [0, "InvalidArgument"] }, confirmationStatus: "confirmed" },
    });

    const updateFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const client = {
      from: vi.fn(() => ({
        select:      vi.fn().mockReturnThis(),
        eq:          vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: PENDING_TOKEN, error: null }),
        update:      updateFn,
      })),
    };
    mockCreateAdminClient.mockReturnValue(client);

    const responsePromise = postConfirm(
      makeRequest({ txSignature: "failedSig", walletAddress: "CreatorWallet111" }),
      ROUTE_PARAMS
    );
    await vi.advanceTimersByTimeAsync(5000);
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
    mockGetSignatureStatus.mockResolvedValue({
      value: { err: null, confirmationStatus: "confirmed" },
    });

    const scheduledToken = {
      ...PENDING_TOKEN,
      is_scheduled: true,
      scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
    };

    const updateFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const client = {
      from: vi.fn(() => ({
        select:      vi.fn().mockReturnThis(),
        eq:          vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: scheduledToken, error: null }),
        update:      updateFn,
      })),
    };
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
    mockGetSignatureStatus.mockResolvedValue({
      value: { err: null, confirmationStatus: "confirmed" },
    });

    const updateFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const client = {
      from: vi.fn(() => ({
        select:      vi.fn().mockReturnThis(),
        eq:          vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: PENDING_TOKEN, error: null }),
        update:      updateFn,
      })),
    };
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
