import { describe, it, expect, beforeEach } from "vitest";
import { looksLikePdf, isOwnWhitepaperUrl, MAX_LOGO_BYTES, MAX_WHITEPAPER_BYTES } from "@/lib/launch/whitepaper";

const buf = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe("looksLikePdf", () => {
  it("accepts a real PDF header", () => expect(looksLikePdf(buf("%PDF-1.7\n..."))).toBe(true));
  it("rejects HTML renamed to .pdf", () => expect(looksLikePdf(buf("<html><script>"))).toBe(false));
  it("rejects an empty or tiny file", () => {
    expect(looksLikePdf(new ArrayBuffer(0))).toBe(false);
    expect(looksLikePdf(buf("%PD"))).toBe(false);
  });
});

describe("isOwnWhitepaperUrl", () => {
  beforeEach(() => { process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.omdot.fun"; });
  it("accepts our own whitepaper URL", () =>
    expect(isOwnWhitepaperUrl("https://db.omdot.fun/storage/v1/object/public/market-images/whitepapers/1-a.pdf")).toBe(true));
  it("rejects another host, another folder or a non-PDF", () => {
    expect(isOwnWhitepaperUrl("https://evil.example/storage/v1/object/public/market-images/whitepapers/1-a.pdf")).toBe(false);
    expect(isOwnWhitepaperUrl("https://db.omdot.fun/storage/v1/object/public/market-images/1-a.pdf")).toBe(false);
    expect(isOwnWhitepaperUrl("https://db.omdot.fun/storage/v1/object/public/market-images/whitepapers/1-a.html")).toBe(false);
    expect(isOwnWhitepaperUrl(42)).toBe(false);
  });
});

describe("upload limits", () => {
  it("stay under the default web server body limit (1 MiB)", () => {
    expect(MAX_WHITEPAPER_BYTES).toBe(1_000_000);
    expect(MAX_LOGO_BYTES).toBe(1_000_000);
    expect(MAX_WHITEPAPER_BYTES).toBeLessThan(1024 * 1024);
  });
});
