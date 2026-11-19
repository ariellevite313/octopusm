/**
 * Rachat et destruction (buyback & burn) d'un token lancé sur OM, déclenché à la main par l'admin.
 * 1. Le wallet de la plateforme achète le token avec `lamports` SOL (Jupiter, sans frais OM).
 * 2. Les tokens reçus sont détruits (burnChecked) : l'offre baisse pour tout le monde.
 * Signé côté serveur par PLATFORM_WALLET_SECRET. Rien ne part sans action de l'admin.
 */
import { PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { solanaConnection } from "@/lib/solana/rpc";
import { getPlatformWallet } from "@/lib/solana/dbc";
import { SOL_MINT, ataOf } from "@/lib/swap/core";
import { swapTransaction } from "@/lib/swap/jupiter";

/** Plafond par rachat : 5 SOL (sécurité contre une faute de frappe) */
export const BUYBACK_MAX_SOL = 5;

async function confirmed(sig: string) {
  const conn = solanaConnection();
  for (let i = 0; i < 20; i++) {
    const tx = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }).catch(() => null);
    if (tx?.meta) {
      if (tx.meta.err) throw new Error("Transaction failed on chain");
      return tx;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("Transaction not confirmed in time");
}

export async function buybackAndBurn(mintStr: string, lamports: bigint): Promise<{ swapSig: string; burnSig: string; burned: string; decimals: number }> {
  if (lamports <= 0n || lamports > BigInt(BUYBACK_MAX_SOL * 1e9)) throw new Error(`Amount must be between 0 and ${BUYBACK_MAX_SOL} SOL`);
  const conn = solanaConnection();
  const kp = getPlatformWallet();
  const owner = kp.publicKey;
  const mint = new PublicKey(mintStr);
  const info = await conn.getAccountInfo(mint);
  if (!info) throw new Error("Token not found");
  const program = info.owner; // Token ou Token-2022

  // 1. Achat
  const built = await swapTransaction({ inputMint: SOL_MINT, outputMint: mintStr, amount: lamports.toString(), slippageBps: 300, priority: "fast" }, 0, owner.toBase58(), null);
  const vtx = VersionedTransaction.deserialize(Buffer.from(built.tx, "base64"));
  vtx.sign([kp]);
  const swapSig = await conn.sendRawTransaction(vtx.serialize(), { skipPreflight: false, maxRetries: 3 });
  const tx = await confirmed(swapSig);

  // Tokens reçus : différence du solde du wallet de la plateforme sur ce token
  const bal = (list: { mint: string; owner?: string; uiTokenAmount: { amount: string; decimals: number } }[] | null | undefined) =>
    (list ?? []).filter((b) => b.mint === mintStr && b.owner === owner.toBase58()).reduce((s, b) => ({ amount: s.amount + BigInt(b.uiTokenAmount.amount), decimals: b.uiTokenAmount.decimals }), { amount: 0n, decimals: 0 });
  const pre = bal(tx.meta?.preTokenBalances as never), post = bal(tx.meta?.postTokenBalances as never);
  const got = post.amount - pre.amount;
  if (got <= 0n) throw new Error("No token received");
  const decimals = post.decimals;

  // 2. Destruction (BurnChecked = instruction 15 du programme de tokens)
  const data = Buffer.alloc(10);
  data.writeUInt8(15, 0);
  data.writeBigUInt64LE(got, 1);
  data.writeUInt8(decimals, 9);
  const burn = new TransactionInstruction({
    programId: program,
    keys: [
      { pubkey: ataOf(owner, mint, program), isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data,
  });
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const btx = new VersionedTransaction(new TransactionMessage({ payerKey: owner, recentBlockhash: blockhash, instructions: [burn] }).compileToV0Message());
  btx.sign([kp]);
  const burnSig = await conn.sendRawTransaction(btx.serialize(), { skipPreflight: false, maxRetries: 3 });
  await confirmed(burnSig);
  return { swapSig, burnSig, burned: got.toString(), decimals };
}
