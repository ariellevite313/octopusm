import { describe, it, expect } from "vitest";
import { computeVotes, capVotes } from "@/lib/hackathon/votes";

const W = { startMs: 1000, endMs: 2000 };
const buy = (usd: number, tokenAmount: number, tsMs: number) => ({ side: "buy" as const, usd, tokenAmount, tsMs });
const sell = (usd: number, tokenAmount: number, tsMs: number) => ({ side: "sell" as const, usd, tokenAmount, tsMs });

describe("computeVotes", () => {
  it("1 dollar spent = 1 vote, at the value paid", () => {
    expect(computeVotes([buy(40, 100, 1500)], W)).toBe(40);
  });
  it("ignores buys outside the window", () => {
    expect(computeVotes([buy(50, 100, 500), buy(10, 20, 2500)], W)).toBe(0);
  });
  it("adds several buys", () => {
    expect(computeVotes([buy(10, 10, 1100), buy(15, 10, 1200)], W)).toBe(25);
  });
  it("selling half cuts the votes in half", () => {
    expect(computeVotes([buy(40, 100, 1100), sell(30, 50, 1300)], W)).toBe(20);
  });
  it("selling everything cancels the vote", () => {
    expect(computeVotes([buy(40, 100, 1100), sell(90, 100, 1300)], W)).toBe(0);
  });
  it("sells oldest tokens first: selling pre-window tokens keeps the window vote", () => {
    expect(computeVotes([buy(50, 100, 500), buy(20, 100, 1100), sell(10, 100, 1300)], W)).toBe(20);
  });
  it("a sell with nothing in the ledger changes nothing (transferred tokens)", () => {
    expect(computeVotes([sell(10, 100, 1300), buy(5, 5, 1400)], W)).toBe(5);
  });
  it("price change does not change votes: selling half at 10x the price still halves the votes", () => {
    expect(computeVotes([buy(10, 100, 1100), sell(500, 50, 1300)], W)).toBe(5);
  });
  it("order of input does not matter", () => {
    expect(computeVotes([sell(30, 50, 1300), buy(40, 100, 1100)], W)).toBe(20);
  });
  it("cap applies per wallet", () => {
    expect(capVotes(2500, 1000)).toBe(1000);
    expect(capVotes(80, 1000)).toBe(80);
  });
});
