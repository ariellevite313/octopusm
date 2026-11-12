"use client";
/**
 * Signer un message avec n'importe quel wallet EVM mobile (dont Aido) par WalletConnect :
 * un QR code (ordinateur) ou l'ouverture de l'app du wallet (mobile). Sert aux comptes sans extension MetaMask,
 * par exemple les utilisateurs Solana qui relient leur compte Aido.
 * Demande NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID (identifiant public gratuit, créé sur cloud.reown.com).
 */
export const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";
const ARC_CHAIN_ID = 5042;

/** Wallets proposes en premier dans la fenetre (la liste complete charge ensuite) : MetaMask, Trust, Rainbow, Coinbase, Phantom */
export const WC_QR_MODAL_OPTIONS = {
  themeMode: "dark" as const,
  explorerRecommendedWalletIds: [
    "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96",
    "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0",
    "1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369",
    "fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa",
    "a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393",
  ],
};

/** Prechauffe WalletConnect des l'ouverture de la page : code charge et connexions reseau ouvertes avant le clic. */
export function prefetchWalletConnect(): void {
  if (typeof document === "undefined" || !WC_PROJECT_ID) return;
  for (const href of ["https://relay.walletconnect.org", "https://api.web3modal.org", "https://explorer-api.walletconnect.com"]) {
    if (!document.head.querySelector(`link[rel="preconnect"][href="${href}"]`)) {
      const l = document.createElement("link"); l.rel = "preconnect"; l.href = href; l.crossOrigin = "anonymous"; document.head.appendChild(l);
    }
  }
  void import("@walletconnect/ethereum-provider").catch(() => {});
}

export const toHex = (s: string) => `0x${Array.from(new TextEncoder().encode(s)).map((b) => b.toString(16).padStart(2, "0")).join("")}`;

export async function signWithWalletConnect(build: (address: string) => string): Promise<{ address: string; signature: string }> {
  if (!WC_PROJECT_ID) throw new Error("Wallet connection is not configured yet");
  const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
  const provider = await EthereumProvider.init({
    projectId: WC_PROJECT_ID,
    optionalChains: [ARC_CHAIN_ID, 1],
    optionalMethods: ["personal_sign"],
    showQrModal: true,
    qrModalOptions: WC_QR_MODAL_OPTIONS,
    rpcMap: { [ARC_CHAIN_ID]: "https://rpc.mainnet.arc.io" },
    metadata: { name: "OMdotfun", description: "OMdotfun", url: window.location.origin, icons: [`${window.location.origin}/omdot-icon.png`] },
  });
  try {
    await provider.connect();
    const address = provider.accounts[0];
    if (!address) throw new Error("No account returned by the wallet");
    const signature = (await provider.request({ method: "personal_sign", params: [toHex(build(address)), address] })) as string;
    return { address, signature };
  } finally {
    try { await provider.disconnect(); } catch { /* déjà fermé */ }
  }
}
