import { NextResponse } from "next/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";

/** Wallet connecté, ou une réponse 401 prête à renvoyer. */
export async function requireWallet(): Promise<{ wallet: string } | { error: NextResponse }> {
  const w = await getWalletAddress();
  if (!w) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  return { wallet: /^0x[0-9a-fA-F]{40}$/.test(w) ? w.toLowerCase() : w };
}
