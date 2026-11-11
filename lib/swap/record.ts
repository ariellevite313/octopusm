/**
 * Lecture d'un swap confirmé : montants réellement échangés et frais reçus par la plateforme,
 * calculés à partir des soldes avant / après de la transaction (jamais des chiffres du navigateur).
 */
import { SOL_MINT } from "./core";

type TB = { accountIndex: number; mint: string; owner?: string; uiTokenAmount: { amount: string } };
export type SwapMeta = {
  wallet: string;           // signataire (index 0)
  feeWallet: string;
  feeLamports: number;
  preLamports: number; postLamports: number;
  preTokens: TB[]; postTokens: TB[];
};

const sumOf = (list: TB[], owner: string, mint: string) =>
  list.filter((b) => b.owner === owner && b.mint === mint).reduce((s, b) => s + BigInt(b.uiTokenAmount.amount), 0n);

/** Variation (post - pré) du solde de `owner` pour `mint`, en unités brutes. Pour SOL : SOL natif + wSOL, hors frais réseau. */
export function deltaOf(m: SwapMeta, owner: string, mint: string): bigint {
  let d = sumOf(m.postTokens, owner, mint) - sumOf(m.preTokens, owner, mint);
  if (mint === SOL_MINT && owner === m.wallet) d += BigInt(m.postLamports - m.preLamports + m.feeLamports);
  return d;
}

export type SwapAmounts = { inAmount: bigint; outAmount: bigint; feeAmount: bigint };

/** null si la transaction n'est pas un swap input → output pour ce portefeuille. */
export function swapAmounts(m: SwapMeta, inputMint: string, outputMint: string, feeMint: string | null): SwapAmounts | null {
  const dIn = deltaOf(m, m.wallet, inputMint);
  const dOut = deltaOf(m, m.wallet, outputMint);
  if (dIn >= 0n || dOut <= 0n) return null;
  let inAmount = -dIn;
  // Création du compte de frais (première fois) payée en SOL : ce n'est pas du volume échangé
  const fee = feeMint ? sumOf(m.postTokens, m.feeWallet, feeMint) - sumOf(m.preTokens, m.feeWallet, feeMint) : 0n;
  if (inputMint === SOL_MINT && inAmount > 2_100_000n) {
    const created = m.preTokens.every((b) => !(b.owner === m.feeWallet && b.mint === feeMint)) && m.postTokens.some((b) => b.owner === m.feeWallet && b.mint === feeMint);
    if (created) inAmount -= 2_039_280n;
  }
  return { inAmount, outAmount: dOut, feeAmount: fee > 0n ? fee : 0n };
}
