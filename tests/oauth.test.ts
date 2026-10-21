import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";

// Base de données simulée : un seul jeton d'accès connu
const TOKEN = "oma_test_token";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(() => ({
    from: () => {
      const q: Record<string, unknown> = {};
      let hash = "";
      q.select = () => q;
      q.update = () => q;
      q.eq = (k: string, v: string) => { if (k === "access_hash") hash = v; return q; };
      q.maybeSingle = async () => ({
        data: hash === sha(TOKEN) ? { id: "t1", wallet: "W", scopes: ["read"], access_expires_at: new Date(Date.now() + 60_000).toISOString(), revoked: false, last_used_at: new Date().toISOString() } : null,
      });
      return q;
    },
  })),
}));

const core = await import("../lib/oauth/core");
const { POST } = await import("../app/mcp/connect/route");
const { USER_TOOLS } = await import("../lib/mcp/user-tools");

const rpc = (body: unknown, auth?: string) =>
  POST(new Request("https://omdot.fun/mcp/connect", { method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: JSON.stringify(body) }));

describe("OAuth helpers", () => {
  it("PKCE S256: accepts the right verifier only", () => {
    const verifier = "a".repeat(50);
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(core.pkceOk(verifier, challenge)).toBe(true);
    expect(core.pkceOk("b".repeat(50), challenge)).toBe(false);
    expect(core.pkceOk("short", challenge)).toBe(false);
  });

  it("scopes: read is always included; unknown scopes are dropped; empty means all", () => {
    expect(core.parseScopes("social")).toEqual(["read", "social"]);
    expect(core.parseScopes("admin money")).toEqual(core.ALL_SCOPES);
    expect(core.parseScopes("")).toEqual(core.ALL_SCOPES);
  });

  it("redirects: https or localhost only", () => {
    expect(core.validRedirect("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(core.validRedirect("http://localhost:3000/cb")).toBe(true);
    expect(core.validRedirect("http://evil.com/cb")).toBe(false);
    expect(core.validRedirect("javascript:alert(1)")).toBe(false);
  });

  it("metadata points to the right endpoints", () => {
    const m = core.authServerMetadata("https://omdot.fun");
    expect(m.code_challenge_methods_supported).toEqual(["S256"]);
    expect(m.token_endpoint).toBe("https://omdot.fun/api/oauth/token");
    expect(core.resourceMetadata("https://omdot.fun").resource).toBe("https://omdot.fun/mcp/connect");
  });
});

describe("/mcp/connect", () => {
  it("without a token: 401 with WWW-Authenticate pointing to the resource metadata (starts the Connect flow)", async () => {
    const r = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toMatch(/resource_metadata=".*\/\.well-known\/oauth-protected-resource\/mcp\/connect"/);
  });

  it("with a bad token: 401", async () => {
    expect((await rpc({ jsonrpc: "2.0", id: 1, method: "initialize" }, "nope")).status).toBe(401);
  });

  it("with a valid token: lists the account tools, without the signature-based ones", async () => {
    const r = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, TOKEN);
    expect(r.status).toBe(200);
    const j = (await r.json()) as { result: { tools: { name: string }[] } };
    const names = j.result.tools.map((t) => t.name);
    expect(names).toContain("create_post");
    expect(names).toContain("my_profile");
    expect(names).toContain("request_approval");
    expect(names).not.toContain("agent_action");
    expect(names).not.toContain("launch_token_prepare");
  });

  it("a read-only connection cannot post (missing social permission)", async () => {
    const r = await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "create_post", arguments: { body: "hi" } } }, TOKEN);
    const j = (await r.json()) as { result: { isError: boolean; content: { text: string }[] } };
    expect(j.result.isError).toBe(true);
    expect(j.result.content[0].text).toMatch(/permission: social/);
  });

  it("no account tool moves money", () => {
    expect(USER_TOOLS.map((t) => t.name).some((n) => /withdraw|transfer|swap|bet$/.test(n))).toBe(false);
  });
});
