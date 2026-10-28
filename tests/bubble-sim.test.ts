import { describe, it, expect } from "vitest";
import { initNodes, stepSim } from "@/lib/bubble-sim";

describe("stepSim", () => {
  it("sépare des bulles qui se chevauchent et reste dans le cadre", () => {
    const nodes = initNodes([{ id: "a", r: 10, x: 50, y: 50 }, { id: "b", r: 8, x: 52, y: 50 }, { id: "c", r: 5, x: 51, y: 52 }]);
    for (let i = 0; i < 400; i++) stepSim(nodes, [], 100, Math.max(0.1, 1 - i * 0.004));
    for (let i = 0; i < nodes.length; i++) {
      expect(nodes[i].x).toBeGreaterThanOrEqual(nodes[i].r); expect(nodes[i].x).toBeLessThanOrEqual(100 - nodes[i].r);
      for (let j = i + 1; j < nodes.length; j++) expect(Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y)).toBeGreaterThanOrEqual(nodes[i].r + nodes[j].r - 0.5);
    }
  });
  it("une bulle tenue (fixed) ne bouge pas", () => {
    const nodes = initNodes([{ id: "a", r: 5, x: 20, y: 20 }, { id: "b", r: 5, x: 22, y: 20 }]);
    nodes[0].fixed = true;
    for (let i = 0; i < 100; i++) stepSim(nodes, [], 100, 1);
    expect(nodes[0].x).toBe(20); expect(nodes[0].y).toBe(20);
  });
  it("les portefeuilles liés se rapprochent", () => {
    const nodes = initNodes([{ id: "a", r: 3, x: 10, y: 50 }, { id: "b", r: 3, x: 90, y: 50 }]);
    const d0 = 80;
    for (let i = 0; i < 300; i++) stepSim(nodes, [{ a: "a", b: "b" }], 100, 1);
    expect(Math.hypot(nodes[0].x - nodes[1].x, nodes[0].y - nodes[1].y)).toBeLessThan(d0);
  });
});
