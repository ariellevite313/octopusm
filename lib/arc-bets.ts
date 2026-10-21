/** Paris sur Arc : adresse qui reçoit les mises (USDC natif Arc, 18 décimales). */
export const ARC_BETS_ADDRESS = (
  process.env.NEXT_PUBLIC_ARC_BETS_ADDRESS ?? "0x31AC68Ade72186f36B869AC2749916ADC9822212"
) as `0x${string}`;

export const ARC_CHAIN_ID_HEX = "0x13b2"; // 5042
