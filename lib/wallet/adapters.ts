/**
 * Détection et abstraction des wallets Solana.
 * Approche custom (window.phantom, window.solflare, etc.) —
 * évite la dépendance lourde @solana/wallet-adapter-wallets.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type SolanaPublicKey = { toString(): string };
export type SolanaSignatureResponse = { signature: Uint8Array };

export type SolanaProvider = {
  isConnected?: boolean;
  isPhantom?: boolean;
  publicKey?: SolanaPublicKey;
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: SolanaPublicKey }>;
  disconnect?: () => Promise<void>;
  signMessage?: (
    message: Uint8Array,
    display?: "hex" | "utf8"
  ) => Promise<SolanaSignatureResponse>;
  // Transaction signing (for on-chain payments)
  signTransaction?: <T = unknown>(transaction: T) => Promise<T>;
  signAndSendTransaction?: <T = unknown>(
    transaction: T,
    options?: {
      skipPreflight?: boolean;
      preflightCommitment?: "processed" | "confirmed" | "finalized";
      maxRetries?: number;
    }
  ) => Promise<{ signature: string }>;
  on?: (
    event: "accountChanged" | "connect" | "disconnect",
    handler: (publicKey?: SolanaPublicKey | null) => void
  ) => void;
  removeListener?: (
    event: "accountChanged" | "connect" | "disconnect",
    handler: (publicKey?: SolanaPublicKey | null) => void
  ) => void;
};

export type WalletType = "phantom" | "solflare" | "backpack" | "trustwallet";

export type WalletInfo = {
  type: WalletType;
  name: string;
  detected: boolean;
  icon: string;
  downloadUrl: string;
  mobileDeepLink: (url: string) => string;
};

// ─── Window augmentation ──────────────────────────────────────────────────────

type WindowWithWallets = Window & {
  solana?: SolanaProvider;
  phantom?: { solana?: SolanaProvider };
  solflare?: SolanaProvider & { isSolflare?: boolean };
  backpack?: SolanaProvider & { isBackpack?: boolean };
  trustwallet?: { solana?: SolanaProvider };
};

// ─── Catalog ──────────────────────────────────────────────────────────────────

const WALLET_CATALOG: Omit<WalletInfo, "detected">[] = [
  {
    type: "phantom",
    name: "Phantom",
    icon: "/phantom-logo.png",
    downloadUrl: "https://phantom.app/download",
    mobileDeepLink: (url) =>
      `https://phantom.app/ul/v1/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(window.location.origin)}`,
  },
  {
    type: "solflare",
    name: "Solflare",
    icon: "/solflare-logo.png",
    downloadUrl: "https://solflare.com",
    mobileDeepLink: (url) =>
      `https://solflare.com/ul/v1/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(window.location.origin)}`,
  },
  {
    type: "backpack",
    name: "Backpack",
    icon: "/backpack-logo.png",
    downloadUrl: "https://backpack.app",
    mobileDeepLink: (url) =>
      `https://backpack.app/ul/v1/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(window.location.origin)}`,
  },
  {
    type: "trustwallet",
    name: "Trust Wallet",
    icon: "https://trustwallet.com/assets/images/media/assets/TWT.png",
    downloadUrl: "https://trustwallet.com",
    mobileDeepLink: (url) =>
      `https://link.trustwallet.com/open_url?coin_id=501&url=${encodeURIComponent(url)}`,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getProviderByType(type: WalletType): SolanaProvider | null {
  if (typeof window === "undefined") return null;
  const w = window as WindowWithWallets;
  switch (type) {
    case "phantom":
      return w.phantom?.solana ?? (w.solana?.isPhantom ? w.solana : null) ?? null;
    case "solflare":
      return w.solflare ?? null;
    case "backpack":
      return w.backpack ?? null;
    case "trustwallet":
      return w.trustwallet?.solana ?? null;
    default:
      return null;
  }
}

export function getAvailableWallets(): WalletInfo[] {
  return WALLET_CATALOG.map((w) => ({
    ...w,
    detected: getProviderByType(w.type) !== null,
  })).sort((a, b) => (b.detected ? 1 : 0) - (a.detected ? 1 : 0));
}

export const WALLET_COLORS: Record<WalletType, string> = {
  phantom: "bg-[#4e44ce]",
  solflare: "bg-[#fc5a20]",
  backpack: "bg-[#e33e3f]",
  trustwallet: "bg-[#3375bb]",
};
