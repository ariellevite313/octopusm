/** Client : envoi d'USDC natif Arc depuis MetaMask (mise, frais de création…), avec un mémo dans `data`. */
import { parseUnits, toHex } from "viem";
import { arc } from "@/lib/arc-chain";
import { ARC_BETS_ADDRESS, ARC_CHAIN_ID_HEX } from "@/lib/arc-bets";
import { getProviderByType } from "@/lib/wallet/adapters";

type EthProvider = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

export type ArcSendResult = { success: true; hash: string } | { success: false; error: string };

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

/** Envoie `amount` USDC à l'adresse des paiements Arc et attend que la transaction soit minée. */
export async function sendArcUsdc(params: { from: string; amount: number; memo: string }): Promise<ArcSendResult> {
  const eth = getProviderByType("metamask") as unknown as EthProvider | null;
  if (!eth?.request) return { success: false, error: "MetaMask not detected. Please install the extension." };

  let hash = "";
  try {
    await ensureArcChain(eth);
    hash = await eth.request({
      method: "eth_sendTransaction",
      params: [{
        from: params.from,
        to: ARC_BETS_ADDRESS,
        value: toHex(parseUnits(params.amount.toFixed(6), 18)),
        data: toHex(new TextEncoder().encode(params.memo)),
      }],
    }) as string;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err);
    const lower = msg.toLowerCase();
    if (lower.includes("reject") || lower.includes("denied") || lower.includes("cancel") || (err as { code?: number })?.code === 4001) {
      return { success: false, error: "Transaction cancelled." };
    }
    if (lower.includes("insufficient")) return { success: false, error: "Insufficient USDC balance on Arc." };
    return { success: false, error: msg };
  }

  for (let i = 0; i < 30; i++) {
    const r = await eth.request({ method: "eth_getTransactionReceipt", params: [hash] }).catch(() => null) as { status?: string } | null;
    if (r) {
      if (r.status === "0x0") return { success: false, error: "Transaction failed on Arc." };
      break;
    }
    await new Promise((res) => setTimeout(res, 1500));
  }
  return { success: true, hash };
}
