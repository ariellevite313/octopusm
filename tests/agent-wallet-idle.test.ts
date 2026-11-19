import { describe, expect, it } from "vitest";
import { isIdle, IDLE_DAYS } from "@/lib/agent-wallet/idle";

const DAY = 86_400_000;
const now = Date.parse("2026-12-20T03:00:00Z");
const ago = (d: number) => new Date(now - d * DAY).toISOString();

describe("wallet d'IA inactif", () => {
  it("inactif à 30 jours exactement, actif avant", () => {
    expect(IDLE_DAYS).toBe(30);
    expect(isIdle([ago(30)], now)).toBe(true);
    expect(isIdle([ago(29.9)], now)).toBe(false);
  });
  it("la dernière activité compte, quelle que soit sa source", () => {
    // création ancienne, mais l'IA a agi il y a 5 jours
    expect(isIdle([ago(90), ago(80), ago(5), ago(70)], now)).toBe(false);
    // l'humain s'est connecté il y a 2 jours
    expect(isIdle([ago(90), ago(80), null, ago(2)], now)).toBe(false);
    // tout est ancien
    expect(isIdle([ago(90), ago(45), null, ago(31)], now)).toBe(true);
  });
  it("sans date lisible, on ne touche à rien", () => {
    expect(isIdle([], now)).toBe(false);
    expect(isIdle([null, undefined, "pas une date"], now)).toBe(false);
  });
});
