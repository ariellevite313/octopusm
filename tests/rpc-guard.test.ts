import { describe, it, expect, vi, beforeEach } from "vitest";

const POST_URL = "https://omdot.fun/api/solana/rpc";
const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(POST_URL, { method: "POST", headers: { "Content-Type": "application/json", host: "omdot.fun", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
const rpc = (method: string, id = 1) => ({ jsonrpc: "2.0", id, method, params: [] });

let n = 0;
const freshIp = () => ({ "x-real-ip": `10.0.0.${++n}` });

const { guardRpc, SOLANA_METHODS, ARC_METHODS } = await import("@/lib/rpc-guard");
const opts = { name: "solana", methods: SOLANA_METHODS, perMinute: 5 };

beforeEach(() => vi.unstubAllGlobals());

describe("proxys RPC : garde-fous", () => {
  it("laisse passer une méthode utilisée par le site", async () => {
    const r = await guardRpc(req(rpc("getLatestBlockhash"), freshIp()), opts);
    expect(r.ok).toBe(true);
  });

  it("refuse une méthode lourde ou inutile (getProgramAccounts)", async () => {
    const r = await guardRpc(req(rpc("getProgramAccounts", 7), freshIp()), opts);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(403);
      expect((await r.response.json()).id).toBe(7);
    }
  });

  it("vérifie chaque requête d'un lot, et limite la taille du lot", async () => {
    const mixed = await guardRpc(req([rpc("getBalance"), rpc("getBlock")], freshIp()), opts);
    expect(mixed.ok).toBe(false);
    const big = await guardRpc(req(Array.from({ length: 21 }, () => rpc("getBalance")), freshIp()), opts);
    expect(big.ok).toBe(false);
    const ok = await guardRpc(req([rpc("getBalance"), rpc("getAccountInfo", 2)], freshIp()), opts);
    expect(ok.ok).toBe(true);
  });

  it("refuse un autre site d'origine, accepte le nôtre et les appels sans Origin", async () => {
    expect((await guardRpc(req(rpc("getBalance"), { ...freshIp(), origin: "https://evil.example" }), opts)).ok).toBe(false);
    expect((await guardRpc(req(rpc("getBalance"), { ...freshIp(), origin: "https://omdot.fun" }), opts)).ok).toBe(true);
    expect((await guardRpc(req(rpc("getBalance"), freshIp()), opts)).ok).toBe(true);
  });

  it("accepte l'adresse officielle du site même si le serveur web ne transmet pas l'hôte", async () => {
    const r = await guardRpc(req(rpc("getBalance"), { ...freshIp(), host: "localhost:3000", origin: "https://omdot.fun" }), opts);
    expect(r.ok).toBe(true);
  });

  it("refuse un JSON invalide, un corps vide et un corps trop gros", async () => {
    expect((await guardRpc(req("{not json", freshIp()), opts)).ok).toBe(false);
    expect((await guardRpc(req("", freshIp()), opts)).ok).toBe(false);
    const huge = await guardRpc(req(JSON.stringify({ ...rpc("getBalance"), pad: "x".repeat(30_000) }), freshIp()), opts);
    expect(huge.ok).toBe(false);
    if (!huge.ok) expect(huge.response.status).toBe(413);
  });

  it("limite par IP : la 6e requête de la minute est refusée (429), une autre IP passe", async () => {
    const ip = freshIp();
    for (let i = 0; i < 5; i++) expect((await guardRpc(req(rpc("getSlot"), ip), opts)).ok).toBe(true);
    const r = await guardRpc(req(rpc("getSlot"), ip), opts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(429);
    expect((await guardRpc(req(rpc("getSlot"), freshIp()), opts)).ok).toBe(true);
  });

  it("Arc : lecture et suivi autorisés, méthodes d'administration refusées", async () => {
    const arc = { name: "arc", methods: ARC_METHODS, perMinute: 50 };
    expect((await guardRpc(req(rpc("eth_call"), freshIp()), arc)).ok).toBe(true);
    expect((await guardRpc(req(rpc("debug_traceTransaction"), freshIp()), arc)).ok).toBe(false);
    expect((await guardRpc(req(rpc("eth_getBlockByNumber"), freshIp()), arc)).ok).toBe(true);
  });
});

describe("route Solana : la panne ne révèle pas les adresses RPC", () => {
  it("renvoie une erreur sans « data » contenant les URLs", async () => {
    process.env.SOLANA_RPC_URL = "https://secret-rpc.example/?api-key=SUPERSECRET";
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    const { POST } = await import("../app/api/solana/rpc/route");
    const res = await POST(req(rpc("getLatestBlockhash"), freshIp()));
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).not.toContain("SUPERSECRET");
    expect(text).not.toContain("secret-rpc");
  });
});
