import { describe, it, expect } from "vitest";
import { isPausedDuration, PAUSED_DURATIONS } from "@/lib/updown-pause";

describe("Up/Down pause", () => {
  it("pauses 5 min to 1 h, keeps 4 h and 24 h open", () => {
    expect(PAUSED_DURATIONS).toEqual([5, 15, 30, 60]);
    expect(isPausedDuration(5)).toBe(true);
    expect(isPausedDuration(60)).toBe(true);
    expect(isPausedDuration(240)).toBe(false);
    expect(isPausedDuration(1440)).toBe(false);
  });
});
