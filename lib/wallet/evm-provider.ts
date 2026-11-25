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

/** Wallet EVM choisi par la personne (ex. « brume ») : prioritaire sur l'ordre par défaut. Gardé sur l'appareil. */
const PREF_KEY = "om_evm_wallet";
const readPref = () => { try { return localStorage.getItem(PREF_KEY); } catch { return null; } };
export function setPreferredEvm(name: "brume" | null) {
  try { if (name) localStorage.setItem(PREF_KEY, name); else localStorage.removeItem(PREF_KEY); } catch { /* stockage indisponible */ }
}
export const prefersBrume = () => readPref() === "brume";

/** Brume Wallet (wallet Ethereum avec Tor) : annoncé par EIP-6963, sinon window.ethereum marqué isBrume. */
export function getBrumeProvider(): EvmProvider | null {
  if (typeof window === "undefined") return null;
  startListening();
  if (announced.size === 0) window.dispatchEvent(new Event("eip6963:requestProvider"));
  for (const a of announced.values()) if (/brume/i.test(a.info.rdns) || /brume/i.test(a.info.name)) return a.provider;
  const eth = (window as unknown as { ethereum?: EvmProvider & { isBrume?: boolean; providers?: (EvmProvider & { isBrume?: boolean })[] } }).ethereum;
  if (eth?.isBrume) return eth;
  return eth?.providers?.find((p) => p.isBrume) ?? null;
}

/** Préférence : MetaMask, puis Rabby, puis Coinbase Wallet. */
const PREFERRED = ["io.metamask", "io.rabby", "com.coinbase.wallet"];

export function getEvmProvider(): EvmProvider | null {
  if (typeof window === "undefined") return null;
  startListening();
  // Les annonces arrivent de façon synchrone après requestProvider ; on redemande au cas où.
  if (announced.size === 0) window.dispatchEvent(new Event("eip6963:requestProvider"));

  if (readPref() === "brume") { const b = getBrumeProvider(); if (b) return b; }
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
