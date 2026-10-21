/**
 * Détection des wallets EVM (MetaMask, Rabby, Coinbase…) via EIP-6963, avec repli sur window.ethereum.
 * EIP-6963 évite les conflits quand plusieurs extensions (ex. Phantom + MetaMask) se disputent window.ethereum.
 */

export type EvmProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
  isPhantom?: boolean;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

type Announced = { info: { rdns: string; name: string }; provider: EvmProvider };

const announced = new Map<string, Announced>();
let listening = false;

function startListening() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("eip6963:announceProvider", (e) => {
    const d = (e as CustomEvent<Announced>).detail;
    if (d?.info?.rdns && d.provider) announced.set(d.info.rdns, d);
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}
startListening();

/** Préférence : MetaMask, puis Rabby, puis Coinbase Wallet. */
const PREFERRED = ["io.metamask", "io.rabby", "com.coinbase.wallet"];

export function getEvmProvider(): EvmProvider | null {
  if (typeof window === "undefined") return null;
  startListening();
  // Les annonces arrivent de façon synchrone après requestProvider ; on redemande au cas où.
  if (announced.size === 0) window.dispatchEvent(new Event("eip6963:requestProvider"));

  for (const rdns of PREFERRED) {
    const a = announced.get(rdns);
    if (a) return a.provider;
  }
  // Autre wallet EVM annoncé, sauf Phantom (qui ne gère pas Arc)
  for (const a of announced.values()) {
    if (a.info.rdns !== "app.phantom" && !a.provider.isPhantom) return a.provider;
  }

  // Repli : window.ethereum (éventuellement multi-fournisseurs)
  const eth = (window as unknown as { ethereum?: EvmProvider & { providers?: EvmProvider[] } }).ethereum;
  if (!eth) return null;
  if (Array.isArray(eth.providers)) {
    return eth.providers.find((p) => p.isMetaMask && !p.isPhantom) ?? eth.providers.find((p) => !p.isPhantom) ?? null;
  }
  return eth.isPhantom ? null : eth;
}
