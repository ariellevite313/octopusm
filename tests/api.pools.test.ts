import { describe, it, expect, vi, beforeEach } from "vitest";
import { authedMock, unauthedMock, makeRequest, json } from "./helpers";

// ── Module mock must be declared before dynamic import ────────────────────────
const mockCreateClient    = vi.fn();
const mockCreateAdminClient = vi.fn();
const mockAwardOcto       = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/supabase/server", () => ({
  createClient:      mockCreateClient,
  createAdminClient: mockCreateAdminClient,
}));
vi.mock("@/lib/octo", () => ({
  awardOcto:         mockAwardOcto,
  OCTO_PER_CREATION: 50,
}));

// Route handler loaded after mocks are set up
const { POST } = await import("../app/api/pools/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_BODY = {
  title:             "Will Bitcoin hit $100k by year end?",
  description:       "A pool on BTC price.",
  cover_image_src:   null,
  options:           [{ label: "Yes" }, { label: "No" }],
  category:          "crypto",
  bet_token:         "usdc",
  betting_closes_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // +2h
};

function setupMocks(wallet: string | null, insertError: { message: string } | null = null) {
  const userMock  = wallet ? authedMock(wallet) : unauthedMock();
  const adminMock = authedMock(wallet ?? "").returnFor("mutuel_markets", {
    data:  null,
    error: insertError,
  });

  // Provide a valid row for .insert().select().single() (returns the created market)
  adminMock.returnFor("mutuel_markets", {
    data: [{ id: "new-market-id", slug: "test-slug", title: "test" }],
    error: insertError,
  });

  mockCreateClient.mockImplementation(userMock.buildAsyncFactory());
  mockCreateAdminClient.mockImplementation(adminMock.buildSyncFactory());
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("POST /api/pools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    setupMocks(null);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.error).toMatch(/not authenticated/i);
  });

  // ── Validation : title ────────────────────────────────────────────────────

  it("returns 400 when title is missing", async () => {
    setupMocks("wallet123");
    const res = await POST(makeRequest({ ...VALID_BODY, title: "" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toMatch(/title/i);
  });

  it("returns 400 when title is too short (< 5 chars)", async () => {
    setupMocks("wallet123");
    const res = await POST(makeRequest({ ...VALID_BODY, title: "Hi" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toMatch(/title/i);
  });

  // ── Validation : options ──────────────────────────────────────────────────

  it("returns 400 when fewer than 2 options", async () => {
    setupMocks("wallet123");
    const res = await POST(makeRequest({ ...VALID_BODY, options: [{ label: "Yes" }] }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toMatch(/option/i);
  });

  it("returns 400 when more than 8 options", async () => {
    setupMocks("wallet123");
    const opts = Array.from({ length: 9 }, (_, i) => ({ label: `Option ${i + 1}` }));
    const res = await POST(makeRequest({ ...VALID_BODY, options: opts }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toMatch(/option/i);
  });

  it("returns 400 when an option has an empty label", async () => {
    setupMocks("wallet123");
    const res = await POST(makeRequest({ ...VALID_BODY, options: [{ label: "Yes" }, { label: "" }] }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toMatch(/option/i);
  });

  // ── Validation : betting_closes_at ────────────────────────────────────────

  it("returns 400 when betting_closes_at is in the past", async () => {
    setupMocks("wallet123");
    const past = new Date(Date.now() - 60_000).toISOString();
    const res  = await POST(makeRequest({ ...VALID_BODY, betting_closes_at: past }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toMatch(/1 hour/i);
  });

  it("returns 400 when betting_closes_at is less than 1 hour from now", async () => {
    setupMocks("wallet123");
    const tooSoon = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // +30 min
    const res     = await POST(makeRequest({ ...VALID_BODY, betting_closes_at: tooSoon }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toMatch(/1 hour/i);
  });

  it("returns 400 when betting_closes_at is invalid", async () => {
    setupMocks("wallet123");
    const res = await POST(makeRequest({ ...VALID_BODY, betting_closes_at: "not-a-date" }));
    expect(res.status).toBe(400);
  });

  // ── Validation : bet_token ────────────────────────────────────────────────

  it("returns 400 for invalid bet_token", async () => {
    setupMocks("wallet123");
    const res = await POST(makeRequest({ ...VALID_BODY, bet_token: "bitcoin" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toMatch(/token/i);
  });

  it("accepts 'clawdtrust' as a valid bet_token", async () => {
    setupMocks("wallet123");
    const res = await POST(makeRequest({ ...VALID_BODY, bet_token: "clawdtrust" }));
    // Should pass token validation and return 201
    expect(res.status).toBe(201);
  });

  // ── JSON body ─────────────────────────────────────────────────────────────

  it("returns 400 when body is not valid JSON", async () => {
    setupMocks("wallet123");
    const req = new Request("https://omdot.fun/api/pools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ bad json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toMatch(/json/i);
  });
});
