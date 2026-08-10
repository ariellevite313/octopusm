/**
 * Tests for PATCH /api/launchpad/[id]/edit
 *
 * Covers:
 *  1. Input validation (missing payload, missing wallet)
 *  2. Authorization (not found, wrong wallet, cancelled)
 *  3. Protected name/ticker check
 *  4. URL format validation (website, twitter, etc.)
 *  5. Category validation
 *  6. Name/ticker availability checks
 *  7. Logo file size/type validation
 *  8. Successful partial update
 *  9. Nothing-to-update case
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { json } from "./helpers";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const { mockCreateAdminClient, mockCheckNameAvailability, mockIsProtectedName } = vi.hoisted(() => ({
  mockCreateAdminClient:     vi.fn(),
  mockCheckNameAvailability: vi.fn(),
  mockIsProtectedName:       vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient:      vi.fn(),
  createAdminClient: mockCreateAdminClient,
}));

vi.mock("@/services/launchpad-service", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/services/launchpad-service")>();
  return {
    ...real,
    checkNameAvailability: mockCheckNameAvailability,
    isProtectedName:       mockIsProtectedName,
  };
});

// ── Route handler ─────────────────────────────────────────────────────────────

const { PATCH: patchEdit } = await import("../app/api/launchpad/[id]/edit/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROUTE_PARAMS = { params: Promise.resolve({ id: "token-edit-uuid" }) };
const CREATOR      = "CreatorWalletXYZ";

function makeFormRequest(payload: object, files: { logo?: Blob } = {}): Request {
  const form = new FormData();
  form.set("payload", JSON.stringify(payload));
  if (files.logo) form.set("logo", files.logo);
  return new Request("https://omdot.fun/api/launchpad/token-edit-uuid/edit", {
    method: "PATCH",
    body:   form,
  });
}

const EXISTING_TOKEN = {
  id:             "token-edit-uuid",
  creator_wallet: CREATOR,
  name:           "OldName",
  ticker:         "OLD",
  status:         "pending",
};

/** Build a simple admin client that returns `token` for launchpad_tokens queries */
function buildAdminMock(token: object | null, updateSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })) {
  return {
    from: vi.fn((table: string) => {
      if (table === "launchpad_tokens") {
        return {
          select:      vi.fn().mockReturnThis(),
          eq:          vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: token, error: null }),
          update:      updateSpy,
        };
      }
      return {};
    }),
    storage: {
      from: vi.fn(() => ({
        upload:       vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://cdn.example.com/img.png" } }),
      })),
    },
  };
}

// Default: isProtectedName returns false (not protected)
beforeEach(() => {
  vi.clearAllMocks();
  mockIsProtectedName.mockReturnValue(false);
  mockCheckNameAvailability.mockResolvedValue({ nameAvailable: true, tickerAvailable: true });
});

// ══════════════════════════════════════════════════════════════════════════════
// 1. Input validation
// ══════════════════════════════════════════════════════════════════════════════

describe("PATCH /api/launchpad/[id]/edit — input validation", () => {
  it("returns 400 when payload field is missing from form", async () => {
    const form = new FormData(); // no payload
    const req  = new Request("https://omdot.fun/x", { method: "PATCH", body: form });
    const res  = await patchEdit(req, ROUTE_PARAMS);
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/missing payload/i);
  });

  it("returns 400 when wallet_address is absent from payload", async () => {
    const res = await patchEdit(makeFormRequest({ name: "NewName" }), ROUTE_PARAMS);
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/wallet_address/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Authorization
// ══════════════════════════════════════════════════════════════════════════════

describe("PATCH /api/launchpad/[id]/edit — authorization", () => {
  it("returns 404 when token does not exist", async () => {
    mockCreateAdminClient.mockReturnValue(buildAdminMock(null));

    const res = await patchEdit(makeFormRequest({ wallet_address: CREATOR }), ROUTE_PARAMS);
    expect(res.status).toBe(404);
  });

  it("returns 403 when wallet_address does not match creator_wallet", async () => {
    mockCreateAdminClient.mockReturnValue(buildAdminMock(EXISTING_TOKEN));

    const res = await patchEdit(makeFormRequest({ wallet_address: "OtherWallet" }), ROUTE_PARAMS);
    expect(res.status).toBe(403);
    expect((await json(res)).error).toMatch(/unauthorized/i);
  });

  it("returns 409 when token is cancelled", async () => {
    mockCreateAdminClient.mockReturnValue(buildAdminMock({ ...EXISTING_TOKEN, status: "cancelled" }));

    const res = await patchEdit(makeFormRequest({ wallet_address: CREATOR }), ROUTE_PARAMS);
    expect(res.status).toBe(409);
    expect((await json(res)).error).toMatch(/cancelled/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. Protected name / ticker
// ══════════════════════════════════════════════════════════════════════════════

describe("PATCH /api/launchpad/[id]/edit — protected names", () => {
  it("returns 409 when new name is protected", async () => {
    mockCreateAdminClient.mockReturnValue(buildAdminMock(EXISTING_TOKEN));
    mockIsProtectedName.mockImplementation((v: string) => v === "OCTO");

    const res = await patchEdit(
      makeFormRequest({ wallet_address: CREATOR, name: "OCTO" }),
      ROUTE_PARAMS
    );
    expect(res.status).toBe(409);
    expect((await json(res)).error).toMatch(/reserved/i);
  });

  it("returns 409 when new ticker is protected", async () => {
    mockCreateAdminClient.mockReturnValue(buildAdminMock(EXISTING_TOKEN));
    mockIsProtectedName.mockImplementation((v: string) => v === "OM");

    const res = await patchEdit(
      makeFormRequest({ wallet_address: CREATOR, ticker: "OM" }),
      ROUTE_PARAMS
    );
    expect(res.status).toBe(409);
    expect((await json(res)).error).toMatch(/reserved/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. URL validation
// ══════════════════════════════════════════════════════════════════════════════

describe("PATCH /api/launchpad/[id]/edit — URL validation", () => {
  beforeEach(() => {
    mockCreateAdminClient.mockReturnValue(buildAdminMock(EXISTING_TOKEN));
  });

  it.each([
    ["website",      "not-a-url"],
    ["twitter",      "x.com/handle"],   // missing protocol
    ["telegram",     "t.me/channel"],   // missing protocol
    ["discord",      "discord.gg/abc"], // missing protocol
    ["other_social", "ftp://invalid"],  // ftp not accepted
  ])("returns 400 for invalid %s URL '%s'", async (field, url) => {
    const res = await patchEdit(
      makeFormRequest({ wallet_address: CREATOR, [field]: url }),
      ROUTE_PARAMS
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/invalid url/i);
  });

  it("accepts valid https URLs for all social fields", async () => {
    const updateSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    mockCreateAdminClient.mockReturnValue(buildAdminMock(EXISTING_TOKEN, updateSpy));

    const res = await patchEdit(
      makeFormRequest({
        wallet_address: CREATOR,
        website:        "https://mytoken.com",
        twitter:        "https://x.com/mytoken",
        telegram:       "https://t.me/mytoken",
        discord:        "https://discord.gg/mytoken",
        other_social:   "https://linktree.com/mytoken",
      }),
      ROUTE_PARAMS
    );
    expect(res.status).toBe(200);
  });

  it("accepts empty string (clears field)", async () => {
    const updateSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    mockCreateAdminClient.mockReturnValue(buildAdminMock(EXISTING_TOKEN, updateSpy));

    const res = await patchEdit(
      makeFormRequest({ wallet_address: CREATOR, website: "" }),
      ROUTE_PARAMS
    );
    expect(res.status).toBe(200);
    // website should be stored as null when empty
    const updateArg = updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg.website).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. Category validation
// ══════════════════════════════════════════════════════════════════════════════

describe("PATCH /api/launchpad/[id]/edit — category", () => {
  beforeEach(() => {
    mockCreateAdminClient.mockReturnValue(buildAdminMock(EXISTING_TOKEN));
  });

  it("returns 400 for invalid category", async () => {
    const res = await patchEdit(
      makeFormRequest({ wallet_address: CREATOR, category: "Hype" }),
      ROUTE_PARAMS
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/invalid category/i);
  });

  it.each(["Meme","Utility","AI","Gaming","DeFi","NFT","x402"])(
    "accepts valid category '%s'",
    async (category) => {
      const updateSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
      mockCreateAdminClient.mockReturnValue(buildAdminMock(EXISTING_TOKEN, updateSpy));

      const res = await patchEdit(
        makeFormRequest({ wallet_address: CREATOR, category }),
        ROUTE_PARAMS
      );
      expect(res.status).toBe(200);
    }
  );
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. Name / ticker availability
// ══════════════════════════════════════════════════════════════════════════════

describe("PATCH /api/launchpad/[id]/edit — name/ticker availability", () => {
  it("returns 409 when new name is already taken", async () => {
    mockCreateAdminClient.mockReturnValue(buildAdminMock(EXISTING_TOKEN));
    mockCheckNameAvailability.mockResolvedValue({ nameAvailable: false, tickerAvailable: true });

    const res = await patchEdit(
      makeFormRequest({ wallet_address: CREATOR, name: "TakenName" }),
      ROUTE_PARAMS
    );
    expect(res.status).toBe(409);
    expect((await json(res)).error).toMatch(/name.*taken/i);
  });

  it("returns 409 when new ticker is already taken", async () => {
    mockCreateAdminClient.mockReturnValue(buildAdminMock(EXISTING_TOKEN));
    mockCheckNameAvailability.mockResolvedValue({ nameAvailable: true, tickerAvailable: false });

    const res = await patchEdit(
      makeFormRequest({ wallet_address: CREATOR, ticker: "TAKEN" }),
      ROUTE_PARAMS
    );
    expect(res.status).toBe(409);
    expect((await json(res)).error).toMatch(/ticker.*taken/i);
  });

  it("skips availability check when name is unchanged", async () => {
    const updateSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    mockCreateAdminClient.mockReturnValue(buildAdminMock(EXISTING_TOKEN, updateSpy));

    // Same name as EXISTING_TOKEN.name → no availability check needed
    const res = await patchEdit(
      makeFormRequest({ wallet_address: CREATOR, name: EXISTING_TOKEN.name }),
      ROUTE_PARAMS
    );
    expect(res.status).toBe(200);
    expect(mockCheckNameAvailability).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. Logo file validation
// ══════════════════════════════════════════════════════════════════════════════

describe("PATCH /api/launchpad/[id]/edit — logo upload", () => {
  it("returns 400 when logo exceeds 5 MB", async () => {
    mockCreateAdminClient.mockReturnValue(buildAdminMock(EXISTING_TOKEN));

    const bigLogo = new Blob([new Uint8Array(6 * 1024 * 1024)], { type: "image/png" });
    const res = await patchEdit(
      makeFormRequest({ wallet_address: CREATOR }, { logo: bigLogo }),
      ROUTE_PARAMS
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/logo.*large/i);
  });

  it("returns 400 for unsupported logo type (AVIF)", async () => {
    mockCreateAdminClient.mockReturnValue(buildAdminMock(EXISTING_TOKEN));

    const avif = new Blob([new Uint8Array(100)], { type: "image/avif" });
    const res  = await patchEdit(
      makeFormRequest({ wallet_address: CREATOR }, { logo: avif }),
      ROUTE_PARAMS
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/unsupported/i);
  });

  it("accepts PNG logo and returns updated logo_url", async () => {
    const updateSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const adminMock = {
      from: vi.fn(() => ({
        select:      vi.fn().mockReturnThis(),
        eq:          vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: EXISTING_TOKEN, error: null }),
        update:      updateSpy,
      })),
      storage: {
        from: vi.fn(() => ({
          upload:       vi.fn().mockResolvedValue({ error: null }),
          getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://cdn.example.com/newlogo.png" } }),
        })),
      },
    };
    mockCreateAdminClient.mockReturnValue(adminMock);

    const validPng = new Blob([new Uint8Array(100)], { type: "image/png" });
    const res = await patchEdit(
      makeFormRequest({ wallet_address: CREATOR }, { logo: validPng }),
      ROUTE_PARAMS
    );
    expect(res.status).toBe(200);
    const updateArg = updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg.logo_url).toContain("cdn.example.com");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. Success paths
// ══════════════════════════════════════════════════════════════════════════════

describe("PATCH /api/launchpad/[id]/edit — success", () => {
  it("updates only the changed fields", async () => {
    const updateSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    mockCreateAdminClient.mockReturnValue(buildAdminMock(EXISTING_TOKEN, updateSpy));

    const res = await patchEdit(
      makeFormRequest({ wallet_address: CREATOR, description: "New description" }),
      ROUTE_PARAMS
    );
    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);

    const updateArg = updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg).toHaveProperty("description", "New description");
    // unchanged fields not present
    expect(updateArg).not.toHaveProperty("name");
    expect(updateArg).not.toHaveProperty("ticker");
  });

  it("can update active tokens (not just pending)", async () => {
    const updateSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    mockCreateAdminClient.mockReturnValue(buildAdminMock({ ...EXISTING_TOKEN, status: "active" }, updateSpy));

    const res = await patchEdit(
      makeFormRequest({ wallet_address: CREATOR, description: "Updated after launch" }),
      ROUTE_PARAMS
    );
    expect(res.status).toBe(200);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. Nothing to update
// ══════════════════════════════════════════════════════════════════════════════

describe("PATCH /api/launchpad/[id]/edit — no changes", () => {
  it("returns 200 with 'nothing to update' when payload has no editable fields", async () => {
    mockCreateAdminClient.mockReturnValue(buildAdminMock(EXISTING_TOKEN));

    // Only wallet_address provided — no actual fields to update
    const res = await patchEdit(
      makeFormRequest({ wallet_address: CREATOR }),
      ROUTE_PARAMS
    );
    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);
  });
});
