import { describe, it, expect } from "vitest";
import { suggestOutcome } from "@/lib/sports/suggest";

const opts = [{ id: "o0", label: "Arsenal" }, { id: "o1", label: "Draw" }, { id: "o2", label: "Chelsea FC" }];
const m = (h: number | null, a: number | null, status = "finished") => ({ home: "Arsenal", away: "Chelsea", score_home: h, score_away: a, status });

describe("suggestOutcome", () => {
  it("suggère la victoire domicile, extérieur et le nul", () => {
    expect(suggestOutcome(m(2, 1), opts)?.optionId).toBe("o0");
    expect(suggestOutcome(m(0, 3), opts)?.optionId).toBe("o2");
    expect(suggestOutcome(m(1, 1), opts)?.optionId).toBe("o1");
  });
  it("ne suggère rien si le match n'est pas terminé ou si les libellés sont ambigus", () => {
    expect(suggestOutcome(m(2, 1, "live"), opts)).toBeNull();
    expect(suggestOutcome(m(null, null), opts)).toBeNull();
    expect(suggestOutcome(m(2, 1), [{ id: "a", label: "Yes" }, { id: "b", label: "No" }])).toBeNull();
    expect(suggestOutcome(null, opts)).toBeNull();
  });
});
