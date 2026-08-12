import { Connection } from "@solana/web3.js";

export type TxVerifyResult =
  | { state: "confirmed" }
  | { state: "pending" }                   // not yet visible / still processing
  | { state: "failed"; reason: string };   // on-chain error (tx landed but reverted)

/**
 * Returns the definitive on-chain state of a transaction:
 * - "confirmed" → landed and succeeded
 * - "failed"    → landed but reverted (do NOT mark token active)
 * - "pending"   → not yet visible (caller can retry or accept optimistically)
 */
export async function verifyTransaction(txSignature: string): Promise<TxVerifyResult> {
  const rpc = process.env.SOLANA_RPC_URL;
  if (!rpc) return { state: "pending" };
  try {
    const connection = new Connection(rpc, "confirmed");
    const result = await connection.getSignatureStatus(txSignature, { searchTransactionHistory: true });
    const status = result.value;
    if (!status) return { state: "pending" };
    if (status.err) {
      return { state: "failed", reason: JSON.stringify(status.err) };
    }
    if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") {
      return { state: "confirmed" };
    }
    return { state: "pending" };
  } catch {
    return { state: "pending" };
  }
}
