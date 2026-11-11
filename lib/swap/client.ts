"use client";
/** Navigateur : demande la transaction au serveur, la fait signer par le portefeuille, puis la fait enregistrer. */
import { VersionedTransaction } from "@solana/web3.js";
import { getProviderByType, type WalletType } from "@/lib/wallet/adapters";

export type SwapReq = { inputMint: string; outputMint: string; amount: string; slippageBps: number; ref?: string };

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? "Swap failed");
  return j;
}

export function toRaw(ui: string, decimals: number): string | null {
  const s = ui.trim().replace(",", ".");
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
  const [i, f = ""] = s.split(".");
  const raw = BigInt((i || "0") + f.slice(0, decimals).padEnd(decimals, "0"));
  return raw > 0n ? raw.toString() : null;
}

export function fromRaw(raw: string | bigint, decimals: number): number {
  return Number(BigInt(raw)) / 10 ** decimals;
}

/** Signe et envoie ; renvoie la signature. Le serveur ne voit jamais la clé. */
export async function executeSwap(req: SwapReq, walletType: WalletType): Promise<string> {
  const provider = getProviderByType(walletType);
  if (!provider) throw new Error("Wallet unavailable");
  const { tx } = await post<{ tx: string }>("/api/swap/tx", req);
  const vtx = VersionedTransaction.deserialize(Buffer.from(tx, "base64"));
  let signature: string;
  if (provider.signAndSendTransaction) {
    signature = (await provider.signAndSendTransaction(vtx, { skipPreflight: false, maxRetries: 3 })).signature;
  } else if (provider.signTransaction) {
    const signed = await provider.signTransaction(vtx);
    const { Connection } = await import("@solana/web3.js");
    const conn = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com", "confirmed");
    signature = await conn.sendRawTransaction((signed as { serialize(): Uint8Array }).serialize(), { skipPreflight: false, maxRetries: 3 });
  } else throw new Error("Wallet does not support signing");

  // Enregistrement (frais, volume) : le serveur relit la transaction une fois confirmée
  void (async () => {
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 2500 + i * 1500));
      const r = await fetch("/api/swap/record", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signature, inputMint: req.inputMint, outputMint: req.outputMint, ref: req.ref }) }).catch(() => null);
      if (r && r.status !== 404) break;
    }
  })();
  return signature;
}
