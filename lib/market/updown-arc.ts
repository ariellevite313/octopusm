/**
 * Up/Down sur Arc (wallet EVM / MetaMask).
 * Même principe que Solana : la mise part en USDC (natif Arc) vers l'adresse des paris avec un mémo,
 * puis le pari est enregistré via /api/updown/bet (vérifié côté serveur, validé par l'admin).
 */
import { sendArcUsdc } from "@/lib/arc-payments";

export async function submitUpDownArc(p: {
  marketId: string;
  direction: "up" | "down";
  amount: number;
  walletAddress: string;
}): Promise<{ success: true; hash: string } | { success: false; error: string }> {
  const memo = `updown?market=${p.marketId}&dir=${p.direction}&wallet=${p.walletAddress}`;
  const sent = await sendArcUsdc({ from: p.walletAddress, amount: p.amount, memo });
  if (!sent.success) return { success: false, error: sent.error };

  try {
    const res = await fetch("/api/updown/bet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        market_id: p.marketId,
        wallet_address: p.walletAddress,
        direction: p.direction,
        amount: p.amount,
        tx_signature: sent.hash,
        chain: "arc",
      }),
    });
    if (!res.ok) {
      const body = await res.json() as { error?: string };
      return { success: false, error: body.error ?? "Could not record the bet." };
    }
  } catch {
    return { success: false, error: "Network error while recording the bet." };
  }
  return { success: true, hash: sent.hash };
}
