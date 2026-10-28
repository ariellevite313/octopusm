import { describe, it, expect } from "vitest";
import { topTwenty } from "@/lib/hackathon/ticker";
import type { BoardRow } from "@/lib/hackathon/leaderboard";

const row = (id: string, volumeUsd: number, votes: number) => ({ projectId: id, volumeUsd, votes }) as unknown as BoardRow;

describe("topTwenty", () => {
  it("ranks by volume and votes together and keeps 20", () => {
    const rows = Array.from({ length: 30 }, (_, i) => row(`p${i}`, 1000 - i * 10, 500 - i));
    const top = topTwenty(rows);
    expect(top).toHaveLength(20);
    expect(top[0].projectId).toBe("p0");
  });
  it("a project strong on both beats one strong on a single side", () => {
    const top = topTwenty([row("vol", 1000, 0), row("votes", 0, 1000), row("both", 800, 800), row("junk", 1, 1)]);
    expect(top[0].projectId).toBe("both");
  });
});
