/**
 * Tips OMERO : validation des entrées, route POST /api/posts/:id/tip et format des compteurs.
 * Les règles de la base (solde, ancienneté, activité, limites, verrou) sont dans send_post_tip,
 * testée à part sur un vrai Postgres ; ici on vérifie que la route n'accepte rien de la page sans contrôle.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkTipInput, compactCount, TIP_DAILY_CAP } from "@/lib/social/tips";

const { rpc, notifyMock, session } = vi.hoisted(() => ({
  rpc: vi.fn(),
  notifyMock: vi.fn(),
  session: { wallet: "SenderWallet111" as string | null },
}));

vi.mock("@/lib/social/session", () => ({
  requireWallet: async () => session.wallet
    ? { wallet: session.wallet }
    : { error: new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 }) },
}));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/social/notify", () => ({ notify: notifyMock }));

const { POST } = await import("../app/api/posts/[id]/tip/route");
const POST_ID = "11111111-1111-1111-1111-111111111111";
const call = (body: unknown, id = POST_ID) =>
  POST(new Request(`https://omdot.fun/api/posts/${id}/tip`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }), { params: Promise.resolve({ id }) });

beforeEach(() => { rpc.mockReset(); notifyMock.mockReset(); session.wallet = "SenderWallet111"; });

describe("checkTipInput", () => {
  it("accepts whole amounts from 1 to the daily cap in OMERO", () => {
    expect(checkTipInput(1, "omero")).toBeNull();
    expect(checkTipInput(TIP_DAILY_CAP, undefined)).toBeNull();
  });
  it.each([0, -5, 1.5, TIP_DAILY_CAP + 1, "50", null, Number.NaN, Infinity])("rejects %s", (a) => {
    expect(checkTipInput(a, "omero")).toBe("invalid_amount");
  });
  it("rejects OMUSD and unknown currencies", () => {
    expect(checkTipInput(10, "omusd")).toBe("currency_unavailable");
    expect(checkTipInput(10, "usdc")).toBe("currency_unavailable");
  });
});

describe("POST /api/posts/:id/tip", () => {
  it("requires a connected wallet", async () => {
    session.wallet = null;
    const res = await call({ amount: 10 });
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a bad post id, a bad body and a bad amount before touching the database", async () => {
    expect((await call({ amount: 10 }, "not-a-uuid")).status).toBe(400);
    expect((await call("{oops")).status).toBe(400);
    expect((await call({ amount: -1 })).status).toBe(400);
    expect((await call({ amount: 10, currency: "omusd" })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("always uses the session wallet as sender, never a value from the body", async () => {
    rpc.mockResolvedValue({ data: { ok: true, post_total: 60, balance: 940, recipient: "AuthorWallet" }, error: null });
    const res = await call({ amount: 60, sender: "SomeoneElse", p_sender: "SomeoneElse" });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("send_post_tip", expect.objectContaining({ p_sender: "SenderWallet111", p_post: POST_ID, p_amount: 60 }));
    expect(await res.json()).toEqual({ ok: true, tip_total: 60, balance: 940 });
    expect(notifyMock).toHaveBeenCalledWith([{ wallet: "AuthorWallet", kind: "tip", actor: "SenderWallet111", postId: POST_ID }]);
  });

  it.each([
    ["insufficient_balance", 400],
    ["account_too_new", 403],
    ["no_activity", 403],
    ["rate_limited", 429],
    ["daily_cap", 429],
    ["self_tip", 400],
    ["post_not_found", 404],
  ])("maps the database refusal %s to HTTP %i and sends no notification", async (code, status) => {
    rpc.mockResolvedValue({ data: { error: code }, error: null });
    const res = await call({ amount: 10 });
    expect(res.status).toBe(status);
    expect((await res.json()).code).toBe(code);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("returns 500 without details when the database fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await call({ amount: 10 });
    expect(res.status).toBe(500);
    expect(notifyMock).not.toHaveBeenCalled();
  });
});

describe("compactCount", () => {
  it.each([[0, "0"], [999, "999"], [1000, "1K"], [1234, "1.2K"], [12400, "12.4K"], [999999, "999K"], [1250000, "1.2M"], [-3, "0"]])("%s → %s", (n, out) => {
    expect(compactCount(n)).toBe(out);
  });
});
