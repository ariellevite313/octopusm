/**
 * Niveaux de frais d'un token Solana (Meteora DBC) : ce que paie le trader et ce que gagne le créateur.
 * Chiffres de la configuration : réduit = 1,25 % (Meteora 0,25 / créateur 0,5 / plateforme 0,5),
 * standard = 2 % (Meteora 0,4 / créateur ≈ 0,91 / plateforme ≈ 0,69). Sert à l'affichage, jamais au calcul des gains.
 */
export type SolFeeTier = "standard" | "low";

export const SOL_FEE_TIERS: Record<SolFeeTier, { total: string; creator: string }> = {
  standard: { total: "2%", creator: "0.9%" },
  low: { total: "1.25%", creator: "0.5%" },
};

/** Niveau d'un token : toute valeur inconnue ou absente = standard. */
export const feeTierOf = (v: unknown): SolFeeTier => (v === "low" ? "low" : "standard");

/** Part du volume que gagne le créateur, pour l'affichage (« 0.5% » ou « 0.9% »). */
export const creatorEarnLabel = (v: unknown): string => SOL_FEE_TIERS[feeTierOf(v)].creator;
