import { describe, it, expect } from "vitest";
import { DAILY_CAP, POINTS, rankScores, scoreEvents, weekStart, weekEnd, isoDay, previousWeek } from "@/lib/weekly-box";

const A = "So1anaWa11etAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const B = "So1anaWa11etBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const day = (d: number, h = 12) => new Date(Date.UTC(2026, 10, 9 + d, h)).toISOString(); // lundi 9 nov 2026

describe("weekly box", () => {
  it("week starts on Monday 00:00 UTC", () => {
    expect(isoDay(weekStart(new Date("2026-11-12T10:00:00Z")))).toBe("2026-11-09");
    expect(isoDay(weekStart(new Date("2026-11-15T23:59:59Z")))).toBe("2026-11-09");
    expect(isoDay(weekStart(new Date("2026-11-16T00:00:00Z")))).toBe("2026-11-16");
    expect(isoDay(weekEnd(new Date("2026-11-09T00:00:00Z")))).toBe("2026-11-16");
    expect(isoDay(previousWeek(new Date("2026-11-09T00:00:00Z")))).toBe("2026-11-02");
  });

  it("each activity gives its points", () => {
    const s = scoreEvents([{ wallet: A, kind: "trade", at: day(0) }, { wallet: A, kind: "post", at: day(0) }, { wallet: A, kind: "tip", at: day(1) }]).get(A)!;
    expect(s.points).toBe(POINTS.trade + POINTS.post + POINTS.tip);
    expect(s.eligible).toBe(true);
  });

  it("caps each activity per day", () => {
    const ev = Array.from({ length: 20 }, () => ({ wallet: A, kind: "post" as const, at: day(2) }));
    ev.push({ wallet: A, kind: "post", at: day(3) });
    const s = scoreEvents(ev).get(A)!;
    expect(s.counts.post).toBe(DAILY_CAP.post + 1);
    expect(s.points).toBe((DAILY_CAP.post + 1) * POINTS.post);
  });

  it("needs a trade and a post to be ranked", () => {
    const m = scoreEvents([
      ...Array.from({ length: 5 }, () => ({ wallet: A, kind: "post" as const, at: day(0) })),
      { wallet: B, kind: "bet", at: day(1) }, { wallet: B, kind: "bag", at: day(1) },
    ]);
    expect(m.get(A)!.eligible).toBe(false);
    expect(rankScores(m.values()).map((s) => s.wallet)).toEqual([B]);
  });

  it("ranks by points and skips banned wallets", () => {
    const m = scoreEvents([
      { wallet: A, kind: "trade", at: day(0) }, { wallet: A, kind: "post", at: day(0) }, { wallet: A, kind: "launch", at: day(0) },
      { wallet: B, kind: "trade", at: day(0) }, { wallet: B, kind: "post", at: day(0) },
    ]);
    expect(rankScores(m.values()).map((s) => s.wallet)).toEqual([A, B]);
    expect(rankScores(m.values(), (w) => w === A).map((s) => s.wallet)).toEqual([B]);
  });

  it("merges EVM addresses whatever the case", () => {
    const m = scoreEvents([
      { wallet: "0xAbCdEf0000000000000000000000000000000001", kind: "trade", at: day(0) },
      { wallet: "0xabcdef0000000000000000000000000000000001", kind: "post", at: day(0) },
    ]);
    expect(m.size).toBe(1);
    expect([...m.values()][0].eligible).toBe(true);
  });
});
