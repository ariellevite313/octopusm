/** Réglages publics du hackathon. Un seul endroit pour les dates, le montant et les liens. */
export const HACKATHON = {
  name: "OM Builders Hackathon",
  startsAt: "2026-11-24T00:00:00Z",
  /** Dernier moment pour s'inscrire : après, seuls les projets déjà inscrits concourent */
  applicationsCloseAt: "2026-12-15T23:59:59Z",
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

/**
 * Inscriptions : ouvertes jusqu'au 15 décembre inclus. Après cette date, seuls les projets déjà inscrits concourent.
 * Les projets inscrits avant le début apparaissent tout de suite ; le classement, les votes et le volume comptent dès le début.
 */
export function applicationsOpen(now: number = Date.now()): boolean {
  return now <= Date.parse(HACKATHON.applicationsCloseAt);
}

/** Taille maximale d'une équipe (client et serveur). */
export const MAX_TEAM = 4;
