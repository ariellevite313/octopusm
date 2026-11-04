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

  it("says it is not available when translation is switched off", async () => {
    process.env.TRANSLATE_DISABLED = "1";
    mockCreateAdminClient.mockReturnValue(admin().client);
    expect((await POST(req({ kind: "post", id: ID, lang: "en" }))).status).toBe(503);
  });

  it("works with no key at all through MyMemory (free), source language detected", async () => {
    delete process.env.GOOGLE_TRANSLATE_API_KEY; delete process.env.LIBRETRANSLATE_URL;
    mockCreateAdminClient.mockReturnValue(admin({ body: "Bonjour à tous, je viens de lancer mon token $OM sur la plateforme" }).client);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ responseStatus: 200, responseData: { translatedText: "Hello everyone, I just launched my token [0] on the platform" } }), { status: 200 }),
    );
    const r = await POST(req({ kind: "post", id: ID, lang: "en" }));
    expect(await r.json()).toEqual({ text: "Hello everyone, I just launched my token $OM on the platform" });
    const url = new URL(String(fetchSpy.mock.calls[0][0]));
    expect(url.hostname).toBe("api.mymemory.translated.net");
    expect(url.searchParams.get("langpair")).toBe("fr|en");
  });

  it("treats a MyMemory quota warning as a failure (nothing cached)", async () => {
    const a = admin({ body: "Bonjour à tous, comment allez-vous aujourd'hui sur la plateforme" });
    mockCreateAdminClient.mockReturnValue(a.client);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ responseStatus: 200, responseData: { translatedText: "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY" } }), { status: 200 }),
    );
    expect((await POST(req({ kind: "post", id: ID, lang: "en" }))).status).toBe(502);
    expect(a.upsert).not.toHaveBeenCalled();
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

import { protectTokens, restoreTokens, chunkText } from "@/lib/social/translate";

describe("free translators keep tickers, mentions, tags and links", () => {
  it("masks then restores them exactly, even with spaces added in brackets", () => {
    const src = "Gm $OM fam, ask @omero_inu #hackathon https://omdot.fun/hackathon";
    const { masked, kept } = protectTokens(src);
    expect(masked).not.toContain("$OM");
    expect(masked).not.toContain("@omero_inu");
    expect(restoreTokens(masked.replace("[0]", "[ 0 ]"), kept)).toBe(src);
  });
});

describe("POST /api/translate with Google (free tier)", () => {
  beforeEach(() => { delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY; delete process.env.LIBRETRANSLATE_URL; });
  afterEach(() => { process.env = { ...env }; vi.restoreAllMocks(); });

  it("uses Google when its key is set, and puts $TICKER back unchanged", async () => {
    process.env.GOOGLE_TRANSLATE_API_KEY = "g-key";
    mockCreateAdminClient.mockReturnValue(admin({ body: "Bonjour $OM" }).client);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_u, init) => {
      const q = JSON.parse((init as RequestInit).body as string).q as string;
      return new Response(JSON.stringify({ data: { translations: [{ translatedText: q.replace("Bonjour", "Hello") }] } }), { status: 200 });
    });
    const r = await POST(req({ kind: "post", id: ID, lang: "en" }));
    expect(await r.json()).toEqual({ text: "Hello $OM" });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("translation.googleapis.com");
    expect(JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string).q).not.toContain("$OM");
  });
});

describe("chunkText", () => {
  it("keeps every piece under 450 bytes and loses no text", () => {
    const long = Array.from({ length: 60 }, (_, i) => `Phrase numéro ${i} avec des accents éèà.`).join(" ");
    const parts = chunkText(long);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(450);
    expect(parts.join(" ").replace(/\s+/g, " ")).toBe(long);
  });
});
