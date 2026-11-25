/**
 * Animations de profil : contours animés de l'avatar et mascottes Omero sur la bannière.
 *  - « level » : débloqué automatiquement en atteignant un niveau Omero
 *  - « shop »  : s'achète une fois en Omero (gardé pour toujours)
 * Les mascottes de la bannière : une par niveau atteint (Blue = 1 … Red = 5).
 */
import { OCTO_TIERS } from "@/components/leaderboard/octo-tier-badge";

export type FrameId = "blue" | "green" | "gold" | "flame" | "ruby" | "ice" | "neon" | "galaxy" | "rainbow";
export type Frame = { id: FrameId; name: string; unlock: { level: string } | { cost: number } };

export const FRAMES: Frame[] = [
  { id: "blue",    name: "Blue pulse",  unlock: { level: "Blue" } },
  { id: "green",   name: "Green wave",  unlock: { level: "Green" } },
  { id: "gold",    name: "Gold aura",   unlock: { level: "Yellow" } },
  { id: "flame",   name: "Flame",       unlock: { level: "Orange" } },
  { id: "ruby",    name: "Ruby crown",  unlock: { level: "Red" } },
  { id: "ice",     name: "Ice",         unlock: { cost: 300 } },
  { id: "neon",    name: "Neon",        unlock: { cost: 600 } },
  { id: "galaxy",  name: "Galaxy",      unlock: { cost: 1000 } },
  { id: "rainbow", name: "Rainbow",     unlock: { cost: 2000 } },
];

export const isFrameId = (s: unknown): s is FrameId => typeof s === "string" && FRAMES.some((f) => f.id === s);
export const frameOf = (id: string | null | undefined) => FRAMES.find((f) => f.id === id) ?? null;

/** Index du niveau atteint (0 = Blue … 4 = Red), -1 si aucun. */
export function levelIndex(totalOcto: number): number {
  let idx = -1;
  OCTO_TIERS.forEach((t, i) => { if (totalOcto >= t.min) idx = i; });
  return idx;
}

/** Vrai si ce compte peut porter ce contour (niveau atteint ou acheté). */
export function canUseFrame(frame: Frame, totalOcto: number, owned: string[]): boolean {
  if ("level" in frame.unlock) {
    const need = OCTO_TIERS.findIndex((t) => t.label === (frame.unlock as { level: string }).level);
    return need >= 0 && levelIndex(totalOcto) >= need;
  }
  return owned.includes(frame.id);
}

/** Nombre de mascottes sur la bannière : une par niveau atteint. */
export const buddyCount = (totalOcto: number) => Math.max(0, levelIndex(totalOcto) + 1);
