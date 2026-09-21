"use client";

/**
 * StakeArc — V2 stub
 *
 * Le mécanisme FeeDistributor (stake/earn) était spécifique à la V4.
 * En V2 (BondingCurveArcV2), il n'y a pas de FeeDistributor par token.
 * Les fees creator sont claimables via BondingCurveArcV2.claimCreatorFees().
 *
 * Composant désactivé — coupure propre V2.
 */

type Props = {
  tokenAddress: string;
  ticker:       string;
  logoUrl?:     string;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function StakeArc(_props: Props) {
  return null;
}
