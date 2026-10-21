import { AsyncLocalStorage } from "node:async_hooks";
import { NextResponse } from "next/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";

/**
 * Wallet vérifié par signature (outils MCP). N'est défini que par le serveur MCP après vérification
 * de la signature ; jamais à partir d'une valeur fournie par le client.
 */
const agentWallet = new AsyncLocalStorage<string>();
export const runAsAgent = <T,>(wallet: string, fn: () => Promise<T>): Promise<T> => agentWallet.run(wallet, fn);

/** Wallet connecté, ou une réponse 401 prête à renvoyer. */
export async function requireWallet(): Promise<{ wallet: string } | { error: NextResponse }> {
  const w = agentWallet.getStore() ?? (await getWalletAddress());
  if (!w) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  return { wallet: /^0x[0-9a-fA-F]{40}$/.test(w) ? w.toLowerCase() : w };
}
