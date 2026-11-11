/**
 * Moteur de swap OM (Solana) : itinéraire Jupiter (/swap/v2/build), transaction montée par notre serveur,
 * signée uniquement par le portefeuille de l'utilisateur.
 *
 * Frais OM : 0,3 % sur les tokens qui ne sont pas lancés sur OM (les tokens OM gardent les frais de leur pool).
 * Les frais sont pris dans l'instruction de swap de Jupiter, en SOL (wSOL) ou en USDC, vers le portefeuille
 * de la plateforme. Une paire doit donc avoir SOL ou USDC d'un côté.
 */
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";

export const SWAP_FEE_BPS = 30;
export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const SLIPPAGE_MIN_BPS = 10;
export const SLIPPAGE_MAX_BPS = 2000; // 20 %
export const SWAP_FEE_WALLET = process.env.NEXT_PUBLIC_TREASURY_ADDRESS ?? "EsR6usyjCzhgL6dZFqHRsw6pDh7CgvfHtkQzCybJMuCZ";

export const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

export const isMint = (s: unknown): s is string => {
  if (typeof s !== "string" || s.length < 32 || s.length > 44) return false;
  try { new PublicKey(s); return true; } catch { return false; }
};

/** Mint dans lequel on prend les frais : SOL en priorité, sinon USDC ; null si la paire n'a ni l'un ni l'autre. */
export function feeMintFor(inputMint: string, outputMint: string): string | null {
  if (inputMint === SOL_MINT || outputMint === SOL_MINT) return SOL_MINT;
  if (inputMint === USDC_MINT || outputMint === USDC_MINT) return USDC_MINT;
  return null;
}

/** Le token échangé (le côté qui n'est ni SOL ni USDC). */
export function tradedMint(inputMint: string, outputMint: string): string {
  const base = new Set([SOL_MINT, USDC_MINT]);
  return base.has(inputMint) && !base.has(outputMint) ? outputMint : inputMint;
}

export function ataOf(owner: PublicKey, mint: PublicKey, program = TOKEN_PROGRAM): PublicKey {
  return PublicKey.findProgramAddressSync([owner.toBuffer(), program.toBuffer(), mint.toBuffer()], ATA_PROGRAM)[0];
}

/** Crée le compte de frais s'il n'existe pas (sans effet sinon). Payé par l'utilisateur la toute première fois seulement. */
export function createAtaIdempotent(payer: PublicKey, owner: PublicKey, mint: PublicKey, program = TOKEN_PROGRAM): TransactionInstruction {
  const ata = ataOf(owner, mint, program);
  return new TransactionInstruction({
    programId: ATA_PROGRAM,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: program, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

export type SwapInput = { inputMint: string; outputMint: string; amount: string; slippageBps: number };

/** Contrôle des paramètres envoyés par le navigateur. */
export function checkSwapInput(b: Record<string, unknown>): { ok: true; v: SwapInput } | { ok: false; error: string } {
  const inputMint = String(b.inputMint ?? ""), outputMint = String(b.outputMint ?? "");
  if (!isMint(inputMint) || !isMint(outputMint)) return { ok: false, error: "Invalid token" };
  if (inputMint === outputMint) return { ok: false, error: "Pick two different tokens" };
  if (!feeMintFor(inputMint, outputMint)) return { ok: false, error: "One side must be SOL or USDC" };
  const amount = String(b.amount ?? "");
  if (!/^[1-9]\d{0,19}$/.test(amount)) return { ok: false, error: "Invalid amount" };
  const slip = Number(b.slippageBps ?? 100);
  if (!Number.isInteger(slip) || slip < SLIPPAGE_MIN_BPS || slip > SLIPPAGE_MAX_BPS) return { ok: false, error: "Slippage must be between 0.1% and 20%" };
  return { ok: true, v: { inputMint, outputMint, amount, slippageBps: slip } };
}
