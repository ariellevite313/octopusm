import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({}) }));
import { base32, unbase32, totp, matchStep, hashCode, recoveryCodes } from "@/lib/twofa";

describe("2FA (TOTP)", () => {
  // Vecteurs officiels RFC 6238 (SHA-1, secret ASCII « 12345678901234567890 »), 6 derniers chiffres
  const key = Buffer.from("12345678901234567890");
  it("matches RFC 6238 test vectors", () => {
    expect(totp(key, Math.floor(59 / 30))).toBe("287082");
    expect(totp(key, Math.floor(1111111109 / 30))).toBe("081804");
    expect(totp(key, Math.floor(1234567890 / 30))).toBe("005924");
    expect(totp(key, Math.floor(2000000000 / 30))).toBe("279037");
  });
  it("round-trips base32", () => {
    expect(unbase32(base32(key)).equals(key)).toBe(true);
    expect(base32(key)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });
  it("accepts one step of drift and refuses reuse", () => {
    const now = 1_700_000_000_000, step = Math.floor(now / 30000);
    expect(matchStep(key, totp(key, step - 1), now, 0)).toBe(step - 1);
    expect(matchStep(key, totp(key, step), now, step)).toBe(null); // déjà utilisé
    expect(matchStep(key, totp(key, step - 3), now, 0)).toBe(null);
    expect(matchStep(key, "12345", now, 0)).toBe(null);
  });
  it("makes 8 distinct recovery codes, hashed without dashes or case", () => {
    const c = recoveryCodes();
    expect(new Set(c).size).toBe(8);
    expect(hashCode(c[0])).toBe(hashCode(c[0].toLowerCase().replace("-", "")));
  });
});
