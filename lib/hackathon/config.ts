/** Réglages publics du hackathon. Un seul endroit pour les dates, le montant et les liens. */
export const HACKATHON = {
  name: "OM Builders Hackathon",
  startsAt: "2026-11-24T00:00:00Z",
  endsAt: "2026-12-24T23:59:59Z",
  payoutAt: "2026-12-25T00:00:00Z",
  maxPrizeUsdc: 100_000,
  discord: "https://discord.gg/q8wzZEtn",
  telegram: "https://t.me/Omdotfun",
} as const;

export type HackathonPhase = "soon" | "live" | "ended";

export function hackathonPhase(now: number = Date.now()): HackathonPhase {
  if (now < Date.parse(HACKATHON.startsAt)) return "soon";
  if (now <= Date.parse(HACKATHON.endsAt)) return "live";
  return "ended";
}

/** Taille maximale d'une équipe (client et serveur). */
export const MAX_TEAM = 4;
