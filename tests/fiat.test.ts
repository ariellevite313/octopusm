import { describe, expect, it } from "vitest";
import { formatFiat, isFiat } from "@/lib/fiat";

describe("formatFiat", () => {
  it("uses real currency signs", () => {
    expect(formatFiat(10, "USD", 1)).toBe("$10.00");
    expect(formatFiat(10, "EUR", 0.9)).toBe("€9.00");
    expect(formatFiat(10, "GBP", 0.8)).toBe("£8.00");
    expect(formatFiat(10, "NGN", 1500)).toBe("₦15,000.00");
    expect(formatFiat(10, "INR", 85)).toBe("₹850.00");
  });
  it("CFA francs without cents", () => { expect(formatFiat(10, "XOF", 600)).toBe("6,000 F CFA"); });
  it("no emoji and only known codes", () => {
    expect(isFiat("XOF")).toBe(true); expect(isFiat("DOGE")).toBe(false);
    expect(formatFiat(1, "JPY", 150)).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
