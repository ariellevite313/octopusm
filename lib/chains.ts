/**
 * lib/chains.ts — source de vérité pour toutes les blockchains supportées.
 *
 * Pour ajouter une nouvelle chaîne :
 *   1. Ajouter une entrée dans CHAINS
 *   2. Lister ses walletTypes compatibles
 *   3. Déclarer ses features
 *   C'est tout — les guards, le swap, le wizard suivent automatiquement.
 */

import type { WalletType } from "@/lib/wallet/adapters";

// ─── Features ─────────────────────────────────────────────────────────────────

export type ChainFeature =
  | "swap"          // swap widget disponible
  | "launch"        // création de token disponible
  | "fees_sol"      // claim fees en SOL
  | "fees_usdc"     // claim fees en USDC
  | "chart"         // graphique on-chain (Trade events)
  | "dbc_progress"; // barre de progression bonding curve DBC

// ─── Chain definition ─────────────────────────────────────────────────────────

export type ChainId = "solana" | "arc";

export type ChainDef = {
  id: ChainId;
  name: string;
  icon: string;               // path sous /public
  nativeCurrency: string;
  walletTypes: WalletType[];  // wallets compatibles — ordre = priorité détection
  features: ChainFeature[];
};

// ─── Registry ─────────────────────────────────────────────────────────────────

export const CHAINS: Record<ChainId, ChainDef> = {
  solana: {
    id: "solana",
    name: "Solana",
    icon: "/solana.png",
    nativeCurrency: "SOL",
    walletTypes: ["phantom", "solflare", "backpack", "trustwallet", "robinhood"],
    features: ["swap", "launch", "fees_sol", "dbc_progress"],
  },
  arc: {
    id: "arc",
    name: "Arc",
    icon: "/arc-logo.jpeg",
    nativeCurrency: "USDC",
    walletTypes: ["metamask"],
    features: ["swap", "launch", "fees_usdc", "chart"],
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Détermine la chaîne à partir du wallet connecté.
 * Retourne null si le walletType est inconnu (ne devrait pas arriver).
 */
export function detectChain(walletType: WalletType | null): ChainId | null {
  if (!walletType) return null;
  for (const chain of Object.values(CHAINS)) {
    if ((chain.walletTypes as string[]).includes(walletType)) return chain.id;
  }
  return null;
}

/**
 * Vérifie si une chaîne supporte une feature donnée.
 */
export function chainSupports(chainId: ChainId | null, feature: ChainFeature): boolean {
  if (!chainId) return false;
  return CHAINS[chainId]?.features.includes(feature) ?? false;
}

/**
 * Retourne la liste des ChainDef dans l'ordre d'affichage.
 */
export function getChainList(): ChainDef[] {
  return Object.values(CHAINS);
}
