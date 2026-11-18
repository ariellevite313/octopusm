/** Serveur : vérifie qu'une transaction Arc a bien payé l'adresse des paiements. */
import { createPublicClient, hexToString, http, parseUnits } from "viem";
import { arc } from "@/lib/arc-chain";
import { ARC_BETS_ADDRESS } from "@/lib/arc-bets";

export type ArcVerifyResult = "ok" | "mismatch" | "unverified";

export async function verifyArcTransfer(p: {
  hash: string; from: string; minUsdc: number; memoIncludes?: string[]; retries?: number; maxAgeSec?: number;
}): Promise<ArcVerifyResult> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(p.hash)) return "mismatch";
  if (!Number.isFinite(p.minUsdc) || p.minUsdc <= 0 || p.minUsdc > 1e9) return "mismatch";
  const client = createPublicClient({ chain: arc, transport: http("https://rpc.mainnet.arc.io") });
  for (let i = 0; i < (p.retries ?? 3); i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1500));
    try {
      const tx = await client.getTransaction({ hash: p.hash as `0x${string}` });
      const okBasic =
        tx.from.toLowerCase() === p.from.toLowerCase() &&
        (tx.to ?? "").toLowerCase() === ARC_BETS_ADDRESS.toLowerCase() &&
        tx.value >= parseUnits(Number(p.minUsdc).toFixed(6), 18);
      if (!okBasic) return "mismatch";
      // La transaction doit être minée ET réussie : une tx échouée, annulée ou encore en attente porte quand même un `value`
      const rc = await client.getTransactionReceipt({ hash: p.hash as `0x${string}` }).catch(() => null);
      if (!rc) continue;
      if (rc.status !== "success") return "mismatch";
      const block = await client.getBlock({ blockNumber: rc.blockNumber }).catch(() => null);
      if (!block) continue;
      if (Date.now() / 1000 - Number(block.timestamp) > (p.maxAgeSec ?? 6 * 3600)) return "mismatch";
      if (p.memoIncludes?.length) {
        let memo = "";
        try { memo = hexToString(tx.input); } catch { /* ignore */ }
        if (!p.memoIncludes.every((m) => memo.includes(m))) return "mismatch";
      }
      return "ok";
    } catch { /* pas encore visible / RPC → on réessaie */ }
  }
  return "unverified";
}
