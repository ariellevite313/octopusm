/**
 * Avantages de chaque niveau Omero sur la plateforme (affichés quand on touche une île de la carte des niveaux).
 * Seulement ce qui existe vraiment : ajouter ici un avantage quand il est codé.
 * `title` et `text` sont des phrases anglaises traduites à l'affichage ; {level} et {frame} sont remplacés par le nom traduit.
 */
import { FRAMES } from "@/lib/profile-cosmetics";

export type Perk = { title: string; text: string };

export const frameOfLevel = (level: string) => FRAMES.find((f) => "level" in f.unlock && f.unlock.level === level) ?? null;

export function levelPerks(index: number): Perk[] {
  const perks: Perk[] = [
    { title: "{level} badge", text: "Shown next to your name on your profile, posts and leaderboards." },
    { title: "Animated frame: {frame}", text: "An animated ring around your profile picture, yours to wear." },
  ];
  if (index > 0) perks.push({ title: "Every frame from earlier levels", text: "You keep all the animations unlocked before." });
  if (index === 4) perks.push({ title: "Top of the map", text: "The highest level on OMdotfun." });
  return perks;
}
