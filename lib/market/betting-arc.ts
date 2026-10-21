/**
 * Paris de prédiction sur Arc (wallet EVM / MetaMask).
 * Même principe que Solana : la mise part en USDC (natif Arc) vers l'adresse des paris, avec un mémo
 * dans le champ data ; le pari est ensuite enregistré via /api/markets/predict (validation par l'admin).
 */
import { parseUnits, toHex } from "viem";
import { arc } from "@/lib/arc-chain";
import { ARC_BETS_ADDRESS, ARC_CHAIN_ID_HEX } from "@/lib/arc-bets";
import { getProviderByType } from "@/lib/wallet/adapters";
import { computeReward, buildBetReference } from "@/lib/market/betting";
import type { BetParams, BetResult } from "@/lib/market/betting";

type EthProvider = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

async function ensureArcChain(eth: EthProvider) {
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC_CHAIN_ID_HEX }] });
  } catch (e) {
    const code = (e as { code?: number })?.code;
    if (code !== 4902 && code !== -32603) throw e;
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: ARC_CHAIN_ID_HEX,
        chainName: arc.name,
        nativeCurrency: arc.nativeCurrency,
        rpcUrls: ["https://rpc.mainnet.arc.io"],
        blockExplorerUrls: arc.blockExplorers ? [arc.blockExplorers.default.url] : undefined,
      }],
    });
  }
}

export async function submitBetArc(params: BetParams): Promise<BetResult> {
  const { marketId, marketTitle, categoryId, optionId, optionLabel, optionMultiplier, amount, walletAddress } = params;

  if (params.token !== "usdc") {
    return { success: false, error: "ClawdTrust bets need a Solana wallet. Use USDC on Arc." };
  }
  const eth = getProviderByType("metamask") as unknown as EthProvider | null;
  if (!eth?.request) {
    return { success: false, error: "MetaMask not detected. Please install the extension." };
  }

  const { reserveFee, totalCharged } = computeReward(amount, optionMultiplier);
  const reference = buildBetReference();
  const memo = ["om?v=1", "kind=prediction", `ref=${reference}`, `marketId=${marketId}`, `selectionId=${optionId}`, "token=usdc", `wallet=${walletAddress}`].join("&");

  let txHash = "";
  try {
    await ensureArcChain(eth);
    txHash = await eth.request({
      method: "eth_sendTransaction",
      params: [{
        from: walletAddress,
        to: ARC_BETS_ADDRESS,
        value: toHex(parseUnits(totalCharged.toFixed(6), 18)),
        data: toHex(new TextEncoder().encode(memo)),
      }],
    }) as string;
  } catch (err) {
    const msg = (err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err));
    const lower = msg.toLowerCase();
    if (lower.includes("reject") || lower.includes("denied") || lower.includes("cancel") || (err as { code?: number })?.code === 4001) {
      return { success: false, error: "Transaction cancelled." };
    }
    if (lower.includes("insufficient")) return { success: false, error: "Insufficient USDC balance on Arc." };
    return { success: false, error: msg };
  }

  // Attendre que la transaction soit minée (le serveur la vérifie avant d'enregistrer le pari)
  for (let i = 0; i < 30; i++) {
    const r = await eth.request({ method: "eth_getTransactionReceipt", params: [txHash] }).catch(() => null) as { status?: string } | null;
    if (r) {
      if (r.status === "0x0") return { success: false, error: "Transaction failed on Arc." };
      break;
    }
    await new Promise((res) => setTimeout(res, 1500));
  }

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
