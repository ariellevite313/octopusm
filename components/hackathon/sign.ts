"use client";

import bs58 from "bs58";
import { buildSignMessage } from "@/lib/launch/wallet-signature";
import { getProviderByType, type WalletType } from "@/lib/wallet/adapters";
import { getEvmProvider } from "@/lib/wallet/evm-provider";

/** Fait signer un message d'action par le wallet connecté (preuve de contrôle, sans transaction). */
export async function signAction(p: { walletType: WalletType | null; wallet: string; action: string; targetId: string }): Promise<{ issuedAt: number; signature: string }> {
  const issuedAt = Date.now();
  // Le serveur lit le wallet de la session (EVM en minuscules) : le message signé doit être identique
  const evm = /^0x[0-9a-fA-F]{40}$/.test(p.wallet);
  const message = buildSignMessage({ action: p.action, targetId: p.targetId, wallet: evm ? p.wallet.toLowerCase() : p.wallet, issuedAt });
  if (evm) {
    const eth = getEvmProvider();
    if (!eth) throw new Error("No EVM wallet found");
    const hex = "0x" + Array.from(new TextEncoder().encode(message)).map((b) => b.toString(16).padStart(2, "0")).join("");
    const signature = (await eth.request({ method: "personal_sign", params: [hex, p.wallet] })) as string;
    return { issuedAt, signature };
  }
  const provider = p.walletType ? getProviderByType(p.walletType) : null;
  if (!provider?.signMessage) throw new Error("This wallet cannot sign messages");
  // Après un rechargement de la page, le wallet n'est pas forcément reconnecté : on le reconnecte avant de signer.
  if (!provider.publicKey) await provider.connect();
  if (provider.publicKey && provider.publicKey.toString() !== p.wallet) throw new Error("Switch your wallet to the account connected on OM");
  const bytes = new TextEncoder().encode(message);
  const res = await provider.signMessage(bytes).catch(() => provider.signMessage!(bytes, "utf8"));
  const sig: Uint8Array = res instanceof Uint8Array ? res : (res as { signature: Uint8Array }).signature;
  return { issuedAt, signature: bs58.encode(sig) };
}
