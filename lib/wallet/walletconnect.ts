"use client";
/**
 * Signer un message avec n'importe quel wallet EVM mobile (dont Aido) par WalletConnect :
 * un QR code (ordinateur) ou l'ouverture de l'app du wallet (mobile). Sert aux comptes sans extension MetaMask,
 * par exemple les utilisateurs Solana qui relient leur compte Aido.
 * Demande NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID (identifiant public gratuit, créé sur cloud.reown.com).
 */
export const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";
const ARC_CHAIN_ID = 5042;

export const toHex = (s: string) => `0x${Array.from(new TextEncoder().encode(s)).map((b) => b.toString(16).padStart(2, "0")).join("")}`;

export async function signWithWalletConnect(build: (address: string) => string): Promise<{ address: string; signature: string }> {
  if (!WC_PROJECT_ID) throw new Error("Wallet connection is not configured yet");
  const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
  const provider = await EthereumProvider.init({
    projectId: WC_PROJECT_ID,
    optionalChains: [ARC_CHAIN_ID, 1],
    optionalMethods: ["personal_sign"],
    showQrModal: true,
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
