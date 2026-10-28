import { describe, it, expect } from "vitest";
import { plannedAnnouncements, renderAnnouncement } from "@/lib/hackathon/announcements";

const at = (iso: string) => Date.parse(iso);
const tr = (s: string, v?: Record<string, string | number>) => (v ? s.replace(/\{(\w+)\}/g, (_, k) => String(v[k])) : s);

describe("plannedAnnouncements", () => {
  it("sends nothing before November 23", () => {
    expect(plannedAnnouncements(at("2026-11-22T12:00:00Z"), { poolUsd: 0 })).toEqual([]);
  });
  it("on November 23: the announcement and a daily reminder", () => {
    const p = plannedAnnouncements(at("2026-11-23T09:00:00Z"), { poolUsd: 0 });
    expect(p.map((x) => x.key)).toContain("announce");
    expect(p.find((x) => x.series === "hackathon-daily")?.template).toBe("daily_before");
  });
  it("one daily reminder per day, replacing yesterday's", () => {
    const a = plannedAnnouncements(at("2026-12-01T09:00:00Z"), { poolUsd: 1200 }).find((x) => x.series === "hackathon-daily")!;
    const b = plannedAnnouncements(at("2026-12-02T09:00:00Z"), { poolUsd: 1500 }).find((x) => x.series === "hackathon-daily")!;
    expect(a.series).toBe(b.series); expect(a.key).not.toBe(b.key);
  });
  it("daily countdown counts the days left", () => {
    const d = plannedAnnouncements(at("2026-12-17T10:00:00Z"), { poolUsd: 800 }).find((x) => x.series === "hackathon-daily")!;
    expect(d.vars.days).toBe(8);
  });
  it("adds a tier message once the pool passes a tier", () => {
    const keys = plannedAnnouncements(at("2026-12-05T10:00:00Z"), { poolUsd: 26_000 }).map((x) => x.key);
    expect(keys).toContain("tier_10000"); expect(keys).toContain("tier_25000"); expect(keys).not.toContain("tier_50000");
  });
  it("week left, last day, ended and paid come on time", () => {
    expect(plannedAnnouncements(at("2026-12-17T12:00:00Z"), { poolUsd: 0 }).map((x) => x.key)).toContain("week_left");
    expect(plannedAnnouncements(at("2026-12-24T01:00:00Z"), { poolUsd: 0 }).map((x) => x.key)).toContain("last_day");
    expect(plannedAnnouncements(at("2026-12-25T00:30:00Z"), { poolUsd: 0 }).map((x) => x.key)).toEqual(expect.arrayContaining(["ended", "paid"]));
  });
  it("stops the daily reminder after the end", () => {
    expect(plannedAnnouncements(at("2026-12-26T10:00:00Z"), { poolUsd: 0 }).some((x) => x.series === "hackathon-daily")).toBe(false);
  });
});

describe("renderAnnouncement", () => {
  it("fills in the numbers", () => {
    expect(renderAnnouncement("daily", { days: 12, pool: 14820 }, tr).body).toContain("12 days left");
    expect(renderAnnouncement("tier", { amount: 25000 }, tr).body).toContain("25 000 $");
  });
});
