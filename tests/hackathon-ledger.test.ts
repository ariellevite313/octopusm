import { describe, it, expect } from "vitest";
import { summarize, type WalletTrade } from "@/lib/hackathon/ledger";

const W = { startMs: 1000, endMs: 2000 };
const b = (wallet: string, usd: number, tokenAmount: number, tsMs: number): WalletTrade => ({ wallet, side: "buy", usd, tokenAmount, tsMs });

describe("summarize", () => {
  it("sums votes per wallet and excludes the team", () => {
    const r = summarize([b("a", 40, 1, 1100), b("b", 10, 1, 1200), b("team", 500, 1, 1300)], new Set(["team"]), W);
    expect(r.votes).toBe(50);
    expect(r.votesByWallet.get("team")).toBeUndefined();
  });
  it("caps the votes of one wallet", () => {
    const r = summarize([b("whale", 5000, 1, 1100)], new Set(), W);
    expect(r.votes).toBe(1000);
  });
  it("ignores wallets under the 1 dollar minimum", () => {
    expect(summarize([b("a", 0.5, 1, 1100)], new Set(), W).votes).toBe(0);
  });
  it("volume counts only trades in the window and not the team", () => {
    const r = summarize([b("a", 10, 1, 500), b("a", 20, 1, 1500), b("team", 99, 1, 1500)], new Set(["team"]), W);
    expect(r.volumeUsd).toBe(20);
  });
});
