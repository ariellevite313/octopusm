import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeRequest, json, SupaMockBuilder } from "./helpers";

const mockCreateClient      = vi.fn();
const mockCreateAdminClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient:      mockCreateClient,
  createAdminClient: mockCreateAdminClient,
}));

const { POST } = await import("../app/api/admin/tasks/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a user client that passes the admin check (is_admin RPC = true) */
function buildAdminClient(isAdmin = true) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { user_metadata: { wallet_address: "adminWallet" } } },
        error: null,
      }),
    },
    rpc: vi.fn().mockResolvedValue({ data: isAdmin, error: null }),
  };
}

function setupMocks(isAdmin = true, tasksTableResult = { data: [{ id: "t1" }], error: null }) {
  mockCreateClient.mockImplementation(() => Promise.resolve(buildAdminClient(isAdmin)));

  const adminMock = new SupaMockBuilder()
    .setUser({ wallet_address: "adminWallet" })
    .returnFor("tasks", tasksTableResult);

  mockCreateAdminClient.mockImplementation(adminMock.buildSyncFactory());
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_CREATE = {
  action:     "create",
  title:      "Follow us on Twitter",
  rewardOcto: 100,
  taskType:   "social",
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/admin/tasks", () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Auth & authorization ──────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    mockCreateClient.mockImplementation(() =>
      Promise.resolve({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
        rpc:  vi.fn(),
      })
    );
    const res = await POST(makeRequest(VALID_CREATE));
    expect(res.status).toBe(401);
    expect((await json(res)).error).toMatch(/not authenticated/i);
  });

  it("returns 403 when user is not an admin", async () => {
    setupMocks(false);
    const res = await POST(makeRequest(VALID_CREATE));
    expect(res.status).toBe(403);
    expect((await json(res)).error).toMatch(/forbidden/i);
  });

  // ── Action: create ────────────────────────────────────────────────────────

  it("returns 400 when title is missing on create", async () => {
    setupMocks();
    const res = await POST(makeRequest({ action: "create", rewardOcto: 100, taskType: "social" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/required/i);
  });

  it("returns 400 when rewardOcto is missing on create", async () => {
    setupMocks();
    const res = await POST(makeRequest({ action: "create", title: "Follow us", taskType: "social" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/required/i);
  });

  it("returns 400 when taskType is missing on create", async () => {
    setupMocks();
    const res = await POST(makeRequest({ action: "create", title: "Follow us", rewardOcto: 100 }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/required/i);
  });

  it("returns 200 on valid create", async () => {
    setupMocks(true, { data: null, error: null }); // insert returns no error
    const res = await POST(makeRequest(VALID_CREATE));
    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);
  });

  it("returns 500 when DB insert fails on create", async () => {
    setupMocks(true, { data: null, error: { message: "DB error" } });
    const res = await POST(makeRequest(VALID_CREATE));
    expect(res.status).toBe(500);
    expect((await json(res)).error).toBe("DB error");
  });

  // ── Action: toggle ────────────────────────────────────────────────────────

  it("returns 400 when taskId is missing on toggle", async () => {
    setupMocks();
    const res = await POST(makeRequest({ action: "toggle", isActive: true }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/taskId/i);
  });

  it("returns 200 on valid toggle", async () => {
    setupMocks(true, { data: null, error: null });
    const res = await POST(makeRequest({ action: "toggle", taskId: "t1", isActive: false }));
    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);
  });

  // ── Action: delete ────────────────────────────────────────────────────────

  it("returns 400 when taskId is missing on delete", async () => {
    setupMocks();
    const res = await POST(makeRequest({ action: "delete" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/taskId/i);
  });

  it("returns 200 on valid delete", async () => {
    setupMocks(true, { data: null, error: null });
    const res = await POST(makeRequest({ action: "delete", taskId: "t1" }));
    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);
  });

  // ── Unknown action ────────────────────────────────────────────────────────

  it("returns 400 for unknown action", async () => {
    setupMocks();
    const res = await POST(makeRequest({ action: "destroy_everything" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/unknown/i);
  });

  // ── JSON body ─────────────────────────────────────────────────────────────

  it("returns 400 for malformed JSON body", async () => {
    setupMocks();
    const req = new Request("https://omdot.fun/api/admin/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
