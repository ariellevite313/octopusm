/** Inscriptions ouvertes avant le début, et vérification du site tolérante aux protections anti-robots. */
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]) }));

import { applicationsOpen, hackathonPhase, HACKATHON } from "@/lib/hackathon/config";
import { siteIsReachable } from "@/lib/hackathon/apply";

describe("applicationsOpen", () => {
  it("is open before the start, during the hackathon, and closed after the end", () => {
    const before = Date.parse(HACKATHON.startsAt) - 13 * 86400_000;
    expect(hackathonPhase(before)).toBe("soon");
    expect(applicationsOpen(before)).toBe(true);
    expect(applicationsOpen(Date.parse(HACKATHON.startsAt) + 1000)).toBe(true);
    expect(applicationsOpen(Date.parse(HACKATHON.endsAt) + 1000)).toBe(false);
  });
});

describe("siteIsReachable", () => {
  afterEach(() => vi.unstubAllGlobals());
  const withStatus = (status: number) => vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status })));

  it.each([200, 301, 302, 401, 403, 429, 503])("accepts a site answering %i (bot protection included)", async (s) => {
    withStatus(s);
    expect(await siteIsReachable("https://example.com")).toBe(true);
  });
  it.each([404, 410, 500, 502])("refuses %i", async (s) => {
    withStatus(s);
    expect(await siteIsReachable("https://example.com")).toBe(false);
  });
  it("refuses http and raw IPs without calling the site", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    expect(await siteIsReachable("http://example.com")).toBe(false);
    expect(await siteIsReachable("https://8.8.8.8")).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});
