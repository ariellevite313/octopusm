/** Règles chiffrées du hackathon. Un seul endroit : toute valeur du règlement se change ici. */
export const RULES = {
  weights: { holders: 0.4, volume: 0.3, votes: 0.3 },
  /** Plafond de votes par wallet (groupe de wallets liés compté comme un seul). */
  voteCapPerWallet: 1000,
  /** Un wallet compte comme holder réel au-dessus de cette part du supply, en %. */
  minHolderPct: 0.001,
  /** Vote minimum par projet, en dollars. */
  minVoteUsd: 1,
  /** Part des prix d'un projet reversée à ses voteurs. */
  voterShare: 0.2,
  /** Part de la part de la plateforme sur les frais de trading qui alimente la cagnotte. */
  poolShareOfPlatformFees: 0.5,
  /** Santé du token au 24 décembre (valeurs à confirmer). */
  health: { minHolders: 100, maxTop10Pct: 40, maxBiggestPct: 5, maxBundlePct: 10, minPriceRatio: 0.3 },
  team: { maxSupplyPct: 10, minFreezeDays: 365 },
} as const;

/** Part de la plateforme par chaîne (voir lib/trade-rewards.ts). */
export const PLATFORM_RATE = { arc: 0.0025, solanaStandard: 0.0068, solanaLow: 0.005 } as const;
