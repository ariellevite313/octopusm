import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { PLATFORM_FEE_SOL, SCHEDULED_FEE_SOL } from "@/lib/launch/platform-fee";

describe("frais de plateforme à la création (Solana)", () => {
  it("0,01 SOL, +0,10 SOL si lancement programmé", () => {
    expect(PLATFORM_FEE_SOL).toBe(0.01);
    expect(SCHEDULED_FEE_SOL).toBe(0.1);
  });
  it("tous les chemins de création utilisent la même constante (aucun montant en dur)", () => {
    for (const f of ["lib/solana/dbc.ts", "app/api/launchpad/[id]/prepare-fee-tx/route.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src).toContain("PLATFORM_FEE_SOL * LAMPORTS_PER_SOL");
      expect(src).not.toMatch(/Math\.floor\(0\.05 \* LAMPORTS_PER_SOL\)/);
    }
    const dbc = readFileSync("lib/solana/dbc.ts", "utf8");
    expect((dbc.match(/PLATFORM_FEE_SOL \* LAMPORTS_PER_SOL/g) ?? []).length).toBe(3);
  });
});
