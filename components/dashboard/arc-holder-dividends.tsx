"use client";

/**
 * ArcHolderDividends — V2 stub
 *
 * Les dividendes holders (FeeDistributor / OMToken) étaient spécifiques à la V4.
 * En V2 (BondingCurveArcV2 + GraduationVaultV4), il n'y a pas de mécanisme
 * de dividendes par holder. Seul le créateur reçoit 1% des trades via creatorAccrued.
 *
 * Composant désactivé — coupure propre V2.
 */

export function ArcHolderDividends() {
  return null;
}
