"use client";
/**
 * Signer quand le navigateur n'a pas de wallet injecté (Chrome ou l'app sur mobile, session ouverte par liens profonds).
 *  - Phantom et Solflare : la transaction part dans le wallet par lien profond chiffré, qui revient sur /phantom-callback.
 *    Sans session de signature dans ce navigateur, on la demande d'abord (une approbation), puis on revient sur la page.
 *  - Les autres wallets (Backpack, Trust, Robinhood, MetaMask) : on ouvre la page dans le navigateur du wallet.
 * Renvoie une promesse qui ne se termine pas : la page est remplacée par le wallet.
 */
import { VersionedTransaction } from "@solana/web3.js";
import { WALLET_CATALOG, type WalletType } from "./adapters";
import { canDeeplink, hasSendSession, isMobileBrowser, startDeeplinkSend, startDeeplinkSession, type PendingSend } from "./phantom-deeplink";

export const OPEN_IN_WALLET_MSG = "Open this page in your wallet app to trade";

export function openInWalletBrowser(type: WalletType): boolean {
  const w = WALLET_CATALOG.find((x) => x.type === type);
  if (!isMobileBrowser() || !w?.mobileDeepLink) return false;
  window.location.href = w.mobileDeepLink(window.location.href);
  return true;
}

/** Adresse qui signe : le payeur des frais, premier compte de la transaction. */
export function feePayerOf(txBytes: Uint8Array): string | null {
  try { return VersionedTransaction.deserialize(txBytes).message.staticAccountKeys[0]?.toBase58() ?? null; } catch { return null; }
}

export function signWithoutProvider(type: WalletType, address: string | null, txBytes: Uint8Array, pending: PendingSend): Promise<never> {
  if (canDeeplink(type) && address) {
    if (hasSendSession(type, address)) startDeeplinkSend(type, txBytes, pending);
    else startDeeplinkSession(type, pending.returnTo);
    return new Promise<never>(() => { /* la page quitte pour le wallet */ });
  }
  if (openInWalletBrowser(type)) return new Promise<never>(() => {});
  return Promise.reject(new Error(isMobileBrowser() ? OPEN_IN_WALLET_MSG : "Wallet unavailable"));
}

export const currentPath = () => `${window.location.pathname}${window.location.search}`;
