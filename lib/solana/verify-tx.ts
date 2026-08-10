import { Connection } from "@solana/web3.js";

/**
 * Checks whether a Solana transaction signature is confirmed (or finalized)
 * on-chain.  Returns false on any error so callers can fall back gracefully.
 */
export async function verifyTransaction(txSignature: string): Promise<boolean> {
  const rpc = process.env.SOLANA_RPC_URL;
  if (!rpc) return false;
  try {
    const connection = new Connection(rpc, "confirmed");
    const result = await connection.getSignatureStatus(txSignature);
    const status = result.value;
    if (!status) return false;
    if (status.err) return false;
    return (
      status.confirmationStatus === "confirmed" ||
      status.confirmationStatus === "finalized"
    );
  } catch {
    return false;
  }
}
