import { describe, it, expect, vi, afterEach } from "vitest";

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; vi.restoreAllMocks(); vi.resetModules(); });

describe("solanaConnection failover", () => {
  it("moves to the fallback RPC when the main one answers 429, and remembers it", async () => {
    process.env.SOLANA_RPC_URL = "https://main.example";
    process.env.SOLANA_RPC_URL_FALLBACKS = "https://backup.example";
    const hits: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const id = JSON.parse(String((init as RequestInit).body)).id;
      const url = String(input);
      hits.push(url);
      if (url.startsWith("https://main.example")) return new Response("Too Many Requests", { status: 429 });
      return new Response(JSON.stringify({ jsonrpc: "2.0", id, result: { context: { slot: 1 }, value: 123 } }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const { solanaConnection } = await import("@/lib/solana/rpc");
    const { PublicKey } = await import("@solana/web3.js");
    const c = solanaConnection();
    expect(await c.getBalance(new PublicKey("11111111111111111111111111111111"))).toBe(123);
    expect(hits[0]).toContain("main.example");
    expect(hits[1]).toContain("backup.example");
    // le RPC saturé est mis de côté : la requête suivante part directement vers le secours
    hits.length = 0;
    await c.getBalance(new PublicKey("11111111111111111111111111111111"));
    expect(hits[0]).toContain("backup.example");
  });

  it("returns a single shared connection", async () => {
    process.env.SOLANA_RPC_URL = "https://main.example";
    const { solanaConnection } = await import("@/lib/solana/rpc");
    expect(solanaConnection()).toBe(solanaConnection());
  });
});
