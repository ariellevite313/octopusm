/**
 * « Chill ton sac » : partage des frais OM avec le détenteur qui a montré le token dans le fil.
 * Sur les 0,3 % de frais : 0,18 % pour OM (pris par Jupiter), 0,12 % (40 %) envoyés au détenteur
 * dans la même transaction. Aucun argent ne transite par le serveur.
 */
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { SOL_MINT, SWAP_FEE_BPS, TOKEN_PROGRAM, USDC_MINT, ataOf } from "./core";

export const CHILL_SHARE_BPS = 12;           // 40 % de 30 bps
export const CHILL_MIN_USD = 1;              // valeur minimale détenue pour poster et toucher
export const CHILL_POSTS_PER_DAY = 5;
export const RENT_EXEMPT_MIN = 890_880;      // lamports minimum d'un compte système

/** Répartition des frais quand un détenteur est lié au swap. */
export function feeSplit(feeBps: number, withRef: boolean): { jupBps: number; refBps: number } {
  if (!withRef || feeBps < SWAP_FEE_BPS) return { jupBps: feeBps, refBps: 0 };
  return { jupBps: feeBps - CHILL_SHARE_BPS, refBps: CHILL_SHARE_BPS };
}

/** Part du détenteur, en unités brutes du mint de base. */
export const cutOf = (raw: bigint, bps: number): bigint => (raw * BigInt(bps)) / 10_000n;

/** Virement de la part du détenteur (SOL natif ou USDC), signé par l'utilisateur. */
export function refTransferIx(user: PublicKey, holder: PublicKey, mint: string, amount: bigint): TransactionInstruction {
  if (mint === SOL_MINT) return SystemProgram.transfer({ fromPubkey: user, toPubkey: holder, lamports: amount });
  if (mint !== USDC_MINT) throw new Error("unsupported ref mint");
  const data = Buffer.alloc(9);
  data.writeUInt8(3, 0);                    // SPL Token : Transfer
  data.writeBigUInt64LE(amount, 1);
  const m = new PublicKey(USDC_MINT);
  return new TransactionInstruction({
    programId: TOKEN_PROGRAM,
    keys: [
      { pubkey: ataOf(user, m), isSigner: false, isWritable: true },
      { pubkey: ataOf(holder, m), isSigner: false, isWritable: true },
      { pubkey: user, isSigner: true, isWritable: false },
    ],
    data,
  });
}
