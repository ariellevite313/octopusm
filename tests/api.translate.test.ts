import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockCreateAdminClient } = vi.hoisted(() => ({ mockCreateAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: mockCreateAdminClient }));

import { POST } from "@/app/api/translate/route";

const ID = "11111111-2222-3333-4444-555555555555";

/** Client minimal : la table de cache renvoie `cached`, la table des posts renvoie `body`. */
function admin({ cached = null as string | null, body = "Bonjour tout le monde" as string | null } = {}) {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const chain = (result: unknown) => {
    const c: Record<string, unknown> = {};
    c.select = () => c; c.eq = () => c;
    c.maybeSingle = async () => ({ data: result, error: null });
    c.upsert = upsert;
    return c;
  };
  return {
    upsert,
    client: { from: (t: string) => t === "content_translations" ? chain(cached ? { text: cached } : null) : chain(body ? { body } : null) },
  };
}

const req = (b: unknown) => new Request("http://x/api/translate", { method: "POST", body: JSON.stringify(b) });
const env = { ...process.env };

describe("POST /api/translate", () => {
  beforeEach(() => { delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY; });
  afterEach(() => { process.env = { ...env }; vi.restoreAllMocks(); });

  it("rejects a bad kind, id or language", async () => {
    mockCreateAdminClient.mockReturnValue(admin().client);
    expect((await POST(req({ kind: "x", id: ID, lang: "fr" }))).status).toBe(400);
    expect((await POST(req({ kind: "post", id: "nope", lang: "fr" }))).status).toBe(400);
    expect((await POST(req({ kind: "post", id: ID, lang: "xx" }))).status).toBe(400);
  });

  it("serves the cached translation without calling a provider", async () => {
    mockCreateAdminClient.mockReturnValue(admin({ cached: "Hello everyone" }).client);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const r = await POST(req({ kind: "post", id: ID, lang: "en" }));
    expect(await r.json()).toEqual({ text: "Hello everyone" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("says it is not available when no provider key is set", async () => {
    mockCreateAdminClient.mockReturnValue(admin().client);
    expect((await POST(req({ kind: "post", id: ID, lang: "en" }))).status).toBe(503);
  });

  it("translates the stored text (never client text) and caches it", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    const a = admin({ body: "Bonjour $OM" });
    mockCreateAdminClient.mockReturnValue(a.client);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: "text", text: "Hello $OM" }] }), { status: 200 }),
    );
    const r = await POST(req({ kind: "post", id: ID, lang: "en", text: "ignored client text" }));
    expect(await r.json()).toEqual({ text: "Hello $OM" });
    const sent = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(sent.messages[0].content).toContain("Bonjour $OM");
    expect(sent.messages[0].content).not.toContain("ignored client text");
    expect(a.upsert).toHaveBeenCalled();
  });
});
