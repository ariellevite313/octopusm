import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(() => { throw new Error("db not available in tests"); }),
}));

const { handleRpc } = await import("../lib/mcp/server");
const { POST, GET } = await import("../app/mcp/route");

const ctx = { origin: "https://omdot.fun", ip: "1.2.3.4" };
type Res = { jsonrpc: string; id: unknown; result?: Record<string, unknown>; error?: { code: number; message: string } };
const rpc = async (body: unknown) => (await handleRpc(body, ctx)) as Res;

describe("MCP server — protocol", () => {
  it("initialize negotiates a supported protocol version and advertises tools", async () => {
    const r = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } });
    expect(r.result?.protocolVersion).toBe("2025-03-26");
    expect(r.result?.capabilities).toHaveProperty("tools");
    expect((r.result?.serverInfo as { name: string }).name).toBe("omdotfun");
  });

  it("falls back to the latest supported version for an unknown one", async () => {
    const r = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } });
    expect(r.result?.protocolVersion).toBe("2025-06-18");
  });

  it("tools/list exposes read tools (readOnly) and launch tools (not readOnly)", async () => {
    const r = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const tools = r.result?.tools as { name: string; annotations: { readOnlyHint: boolean }; inputSchema: { type: string } }[];
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(byName.get_trending_tokens.annotations.readOnlyHint).toBe(true);
    expect(byName.get_profile.annotations.readOnlyHint).toBe(true);
    expect(byName.launch_token_prepare.annotations.readOnlyHint).toBe(false);
    expect(tools.every((t) => t.inputSchema.type === "object")).toBe(true);
  });

  it("ping answers with an empty result", async () => {
    expect((await rpc({ jsonrpc: "2.0", id: 3, method: "ping" })).result).toEqual({});
  });

  it("notifications get no response", async () => {
    expect(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, ctx)).toBeNull();
  });

  it("unknown method → -32601, unknown tool → -32602, invalid request → -32600", async () => {
    expect((await rpc({ jsonrpc: "2.0", id: 4, method: "nope" })).error?.code).toBe(-32601);
    expect((await rpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "nope" } })).error?.code).toBe(-32602);
    expect((await rpc({ id: 6 })).error?.code).toBe(-32600);
  });

  it("supports batches", async () => {
    const out = (await handleRpc([
      { jsonrpc: "2.0", id: 1, method: "ping" },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "ping" },
    ], ctx)) as Res[];
    expect(out).toHaveLength(2);
  });
});

describe("MCP server — tool input validation (errors go back to the model, not HTTP errors)", () => {
  const call = async (name: string, args: unknown) => {
    const r = await rpc({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name, arguments: args } });
    const res = r.result as { isError: boolean; content: { text: string }[] };
    return { isError: res.isError, text: res.content[0].text };
  };

  it("get_token rejects a non-uuid id", async () => {
    const r = await call("get_token", { id: "not-a-uuid" });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/uuid/i);
  });

  it("get_profile rejects an invalid wallet", async () => {
    const r = await call("get_profile", { wallet: "hello" });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/address/i);
  });

  it("feed tools are read-only and validate their inputs", async () => {
    const list = await rpc({ jsonrpc: "2.0", id: 3, method: "tools/list" });
    const tools = list.result?.tools as { name: string; annotations: { readOnlyHint: boolean } }[];
    for (const n of ["list_posts", "get_post_replies", "get_follow_stats"]) {
      expect(tools.find((t) => t.name === n)?.annotations.readOnlyHint).toBe(true);
    }
    expect((await call("list_posts", { author: "nope" })).isError).toBe(true);
    expect((await call("get_post_replies", { id: "x" })).text).toMatch(/uuid/i);
    expect((await call("get_follow_stats", { wallet: "x" })).text).toMatch(/address/i);
  });

  it("create_post tools refuse Arc wallets, empty posts and bad signatures", async () => {
    const list = await rpc({ jsonrpc: "2.0", id: 4, method: "tools/list" });
    const tools = list.result?.tools as { name: string; annotations: { readOnlyHint: boolean } }[];
    expect(tools.find((t) => t.name === "create_post_prepare")?.annotations.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === "create_post")?.annotations.readOnlyHint).toBe(false);
    expect((await call("create_post_prepare", { wallet: "not-a-wallet", body: "hi" })).text).toMatch(/solana or arc/i);
    expect((await call("create_post_prepare", { wallet: "0x1111111111111111111111111111111111111111", body: "hi" })).isError).toBe(false);
    expect((await call("create_post_prepare", { wallet: "11111111111111111111111111111111", body: "  " })).text).toMatch(/empty/i);
    const r = await call("create_post", { wallet: "11111111111111111111111111111111", body: "hi", timestamp: Date.now(), signature: "AA==" });
    expect(r.isError).toBe(true);
  });

  it("agent_action tools validate wallet, action and params; they refuse unsigned calls", async () => {
    const W = "11111111111111111111111111111111";
    expect((await call("agent_action_prepare", { wallet: "nope", action: "follow" })).text).toMatch(/solana or arc/i);
    expect((await call("agent_action_prepare", { wallet: W, action: "withdraw_money" })).text).toMatch(/unknown action/i);
    expect((await call("agent_action_prepare", { wallet: W, action: "follow", params: [] })).text).toMatch(/object/i);
    expect((await call("agent_action_prepare", { wallet: W, action: "constructor" })).text).toMatch(/unknown action/i);
    expect((await call("agent_action", { wallet: W, action: "follow", params: { wallet: W }, timestamp: Date.now(), signature: "AA==" })).isError).toBe(true);
  });

  it("launch_token_prepare requires a valid Solana wallet (an Arc 0x address is refused)", async () => {
    const r = await call("launch_token_prepare", { wallet: "0x1111111111111111111111111111111111111111", name: "A", ticker: "AAA" });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/solana/i);
  });

  it("launch_token_submit requires a uuid token_id", async () => {
    const r = await call("launch_token_submit", { token_id: "x", wallet: "w", step: "a", signed_tx_base64: "AA==" });
    expect(r.isError).toBe(true);
  });

  it("tool errors never leak internals (db failure → generic message)", async () => {
    const r = await call("get_trending_tokens", {});
    expect(r.isError).toBe(true);
    expect(r.text).not.toMatch(/db not available/);
  });
});

describe("/mcp HTTP route", () => {
  it("GET returns the server card", async () => {
    const res = await GET();
    const body = await res.json() as { name: string; tools: unknown[] };
    expect(body.name).toBe("omdotfun");
    expect(body.tools.length).toBeGreaterThan(5);
  });

  it("POST answers JSON-RPC, 202 for notifications, 400 for bad JSON", async () => {
    const mk = (body: string) => new Request("https://omdot.fun/mcp", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "9.9.9.9" }, body });
    const ok = await POST(mk(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })));
    expect(ok.status).toBe(200);
    const note = await POST(mk(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })));
    expect(note.status).toBe(202);
    const bad = await POST(mk("{not json"));
    expect(bad.status).toBe(400);
  });
});

describe("MCP request_approval", () => {
  it("is listed as an agent action and its description says nothing is executed", async () => {
    const r = await rpc({ jsonrpc: "2.0", id: 20, method: "tools/list" });
    const tools = r.result?.tools as { name: string; description: string; inputSchema: { properties: { action?: { enum?: string[] } } } }[];
    const prep = tools.find((t) => t.name === "agent_action_prepare")!;
    expect(prep.inputSchema.properties.action?.enum).toContain("request_approval");
    expect(prep.description).toMatch(/nothing is executed/i);
  });
});

describe("MCP trading tools", () => {
  const call = async (name: string, args: unknown) => {
    const r = await rpc({ jsonrpc: "2.0", id: 30, method: "tools/call", params: { name, arguments: args } });
    const res = r.result as { isError: boolean; content: { text: string }[] };
    return { isError: res.isError, text: res.content[0].text };
  };
  it("trade_prepare validates its inputs before touching anything", async () => {
    expect((await call("trade_prepare", { wallet: "W", token_id: "nope", side: "buy", amount: 1 })).text).toMatch(/uuid/);
    expect((await call("trade_prepare", { wallet: "W", token_id: "00000000-0000-4000-8000-000000000001", side: "hold", amount: 1 })).text).toMatch(/buy or sell/);
    expect((await call("trade_prepare", { wallet: "W", token_id: "00000000-0000-4000-8000-000000000001", side: "buy", amount: -2 })).text).toMatch(/positive/);
  });
  it("trade_submit refuses an unknown chain and garbage transactions", async () => {
    expect((await call("trade_submit", { chain: "eth" })).text).toMatch(/solana or arc/);
    expect((await call("trade_submit", { chain: "solana", signed_tx_base64: "AAAA" })).isError).toBe(true);
    expect((await call("trade_submit", { chain: "arc", signed_tx: "0x00" })).isError).toBe(true);
  });
});
