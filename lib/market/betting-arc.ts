/**
 * Paris de prédiction sur Arc (wallet EVM / MetaMask).
 * Même principe que Solana : la mise part en USDC (natif Arc) vers l'adresse des paris, avec un mémo
 * dans le champ data ; le pari est ensuite enregistré via /api/markets/predict (validation par l'admin).
 */
import { sendArcUsdc } from "@/lib/arc-payments";
import { readVia } from "@/lib/social/share-via";
import { computeReward, buildBetReference } from "@/lib/market/betting";
import type { BetParams, BetResult } from "@/lib/market/betting";

export async function submitBetArc(params: BetParams): Promise<BetResult> {
  const { marketId, marketTitle, categoryId, optionId, optionLabel, optionMultiplier, amount, walletAddress } = params;

  if (params.token !== "usdc") {
    return { success: false, error: "ClawdTrust bets need a Solana wallet. Use USDC on Arc." };
  }
  const { reserveFee, totalCharged } = computeReward(amount, optionMultiplier);
  const reference = buildBetReference();
  const memo = ["om?v=1", "kind=prediction", `ref=${reference}`, `marketId=${marketId}`, `selectionId=${optionId}`, "token=usdc", `wallet=${walletAddress}`].join("&");

  const sent = await sendArcUsdc({ from: walletAddress, amount: totalCharged, memo });
  if (!sent.success) return { success: false, error: sent.error };
  const txHash = sent.hash;

  try {
    const res = await fetch("/api/markets/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payment_request_id: `req-${Date.now().toString(36)}`,
        payment_reference:  reference,
        title:              marketTitle,
        subtitle:           optionLabel,
        category_label:     categoryId,
        market_id:          marketId,
        share_post_id:      readVia(marketId),
        selection_id:       optionId,
        selection_label:    optionLabel,
        amount_usdc:        amount,
        reserve_fee_usdc:   reserveFee,
        total_paid_usdc:    totalCharged,
        token:              "usdc",
        chain:              "arc",
        tx_signature:       txHash,
        wallet_address:     walletAddress,
      }),
    });
    if (!res.ok) {
      const body = await res.json() as { error?: string };
      console.error("[betting-arc] predict API:", body.error);
      return { success: false, error: body.error ?? "Could not record the bet." };
    }
  } catch (e) {
    console.error("[betting-arc] predict API fetch:", e);
  }

  return { success: true, reference, signature: txHash };
}
