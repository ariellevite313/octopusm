import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeRequest, authedMock, unauthedMock, json } from "./helpers";

const mockCreateClient = vi.fn();
const mockCreateAdminClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient, createAdminClient: mockCreateAdminClient }));
vi.mock("@/lib/rate-limit", () => ({ rateHit: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/auth/get-wallet", () => ({ getWalletAddress: vi.fn() }));

const { getWalletAddress } = await import("@/lib/auth/get-wallet");
const marketComments = await import("../app/api/markets/[id]/comments/route");
const marketLike = await import("../app/api/markets/[id]/comments/like/route");
const tokenComments = await import("../app/api/launchpad/[id]/comments/route");
const watchlist = await import("../app/api/launchpad/[id]/watchlist/route");

const SESSION = "SessionWallet111";
const VICTIM = "VictimWallet999";
const ID = "11111111-1111-4111-8111-111111111111";
const COMMENT = "22222222-2222-4222-8222-222222222222";
const ctx = { params: Promise.resolve({ id: ID }) };

/** Faux client admin : enregistre les insertions, renvoie `rows[table]` pour les lectures. */
function adminSpy(rows: Record<string, unknown> = {}) {
  const inserts: { table: string; row: Record<string, unknown> }[] = [];
  const client = {
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      for (const m of ["select", "update", "delete", "eq", "neq", "in", "gt", "gte", "is", "not", "limit", "order"]) chain[m] = vi.fn(self);
      chain.insert = vi.fn((row: Record<string, unknown>) => { inserts.push({ table, row }); return chain; });
      const one = () => Promise.resolve({ data: rows[table] ?? null, error: null });
      chain.single = vi.fn(one);
      chain.maybeSingle = vi.fn(one);
      Object.defineProperty(chain, "then", { get: () => (res: (v: unknown) => void) => res({ data: [], error: null, count: 0 }) });
      return chain;
    }),
  };
  mockCreateAdminClient.mockReturnValue(client);
  return inserts;
}

function login(wallet: string | null) {
  mockCreateClient.mockImplementation((wallet ? authedMock(wallet) : unauthedMock()).buildAsyncFactory());
  vi.mocked(getWalletAddress).mockResolvedValue(wallet);
}

beforeEach(() => { vi.clearAllMocks(); });

describe("commentaires et suivi : le wallet vient de la session, jamais de la requête", () => {
  it("commentaire de marché : refusé sans connexion", async () => {
    login(null); adminSpy();
    const res = await marketComments.POST(makeRequest({ content: "hello", wallet_address: VICTIM }), ctx);
    expect(res.status).toBe(401);
  });

  it("commentaire de marché : un faux wallet dans le corps est ignoré", async () => {
    login(SESSION);
    const inserts = adminSpy({ market_comments: { id: "c1" } });
    await marketComments.POST(makeRequest({ content: "hello", wallet_address: VICTIM }), ctx);
    const row = inserts.find((i) => i.table === "market_comments")?.row;
    expect(row?.wallet_address).toBe(SESSION);
  });

  it("like de commentaire de marché : refusé sans connexion", async () => {
    login(null); adminSpy();
    const res = await marketLike.POST(makeRequest({ comment_id: COMMENT, wallet_address: VICTIM }), ctx);
    expect(res.status).toBe(401);
  });

  it("like de commentaire de marché : le like est au nom du compte connecté", async () => {
    login(SESSION);
    const inserts = adminSpy({ market_comments: { id: COMMENT, market_id: ID } });
    const res = await marketLike.POST(makeRequest({ comment_id: COMMENT, wallet_address: VICTIM }), ctx);
    expect(res.status).toBe(200);
    expect((await json(res)).liked).toBe(true);
    expect(inserts.find((i) => i.table === "market_comment_likes")?.row.wallet_address).toBe(SESSION);
  });

  it("commentaire de token : refusé sans connexion", async () => {
    login(null); adminSpy();
    const res = await tokenComments.POST(makeRequest({ content: "hello", wallet_address: VICTIM }), ctx);
    expect(res.status).toBe(401);
  });

  it("commentaire de token : un faux wallet dans le corps est ignoré", async () => {
    login(SESSION);
    const inserts = adminSpy({ launchpad_tokens: { id: ID }, launchpad_comments: { id: "c1" } });
    await tokenComments.POST(makeRequest({ content: "hello", wallet_address: VICTIM }), ctx);
    expect(inserts.find((i) => i.table === "launchpad_comments")?.row.wallet_address).toBe(SESSION);
  });

  it("liste de suivi : refusée sans connexion", async () => {
    login(null); adminSpy();
    const res = await watchlist.POST(makeRequest({ wallet: VICTIM }), ctx);
    expect(res.status).toBe(401);
  });

  it("liste de suivi : ajout au nom du compte connecté, pas du wallet envoyé", async () => {
    login(SESSION);
    const inserts = adminSpy();
    const res = await watchlist.POST(makeRequest({ wallet: VICTIM }), ctx);
    expect((await json(res)).watching).toBe(true);
    expect(inserts.find((i) => i.table === "launchpad_watchlist")?.row.wallet).toBe(SESSION);
  });
});
