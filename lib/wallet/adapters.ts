/**
 * Détection et abstraction des wallets Solana.
 * Approche custom (window.phantom, window.solflare, etc.) —
 * évite la dépendance lourde @solana/wallet-adapter-wallets.
 */

import bs58 from "bs58";
import { getEvmProvider } from "@/lib/wallet/evm-provider";

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

export type WalletType = "phantom" | "solflare" | "backpack" | "trustwallet" | "robinhood" | "metamask";

export type WalletInfo = {
  type: WalletType;
  name: string;
  detected: boolean;
  icon: string;
  downloadUrl: string;
  /** null : pas de lien officiel pour ouvrir le site dans le navigateur du wallet */
  mobileDeepLink: ((url: string) => string) | null;
};

// ─── Window augmentation ──────────────────────────────────────────────────────

type WindowWithWallets = Window & {
  solana?: SolanaProvider;
  phantom?: { solana?: SolanaProvider };
  solflare?: SolanaProvider & { isSolflare?: boolean };
  backpack?: SolanaProvider & { isBackpack?: boolean };
  trustwallet?: { solana?: SolanaProvider };
  robinhood?: { solana?: SolanaProvider };
  ethereum?: {
    isMetaMask?: boolean;
    isPhantom?: boolean;
    providers?: Array<{ isMetaMask?: boolean; isPhantom?: boolean }>;
    request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  };
};

// ─── Catalog ──────────────────────────────────────────────────────────────────

const WALLET_CATALOG: Omit<WalletInfo, "detected">[] = [
  {
    type: "phantom",
    name: "Phantom",
    icon: "/phantom-logo.png",
    downloadUrl: "https://phantom.app/download",
    // https://docs.phantom.com/phantom-deeplinks/other-methods/browse (sans /v1/)
    mobileDeepLink: (url) =>
      `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(window.location.origin)}`,
  },
  {
    type: "solflare",
    name: "Solflare",
    icon: "/solflare-logo.png",
    downloadUrl: "https://solflare.com",
    // https://docs.solflare.com/solflare/technical/deeplinks/other-methods/browse (avec /v1/)
    mobileDeepLink: (url) =>
      `https://solflare.com/ul/v1/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(window.location.origin)}`,
  },
  {
    type: "backpack",
    name: "Backpack",
    icon: "/backpack-logo.png",
    downloadUrl: "https://backpack.app",
    // https://docs.backpack.app/deeplinks/other-methods (même format que Phantom, sans /v1/)
    mobileDeepLink: (url) =>
      `https://backpack.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(window.location.origin)}`,
  },
  {
    type: "trustwallet",
    name: "Trust Wallet",
    icon: "https://trustwallet.com/assets/images/media/assets/TWT.png",
    downloadUrl: "https://trustwallet.com",
    // coin_id = SLIP-44 (501 = Solana) : le navigateur de Trust s'ouvre sur le réseau Solana
    mobileDeepLink: (url) =>
      `https://link.trustwallet.com/open_url?coin_id=501&url=${encodeURIComponent(url)}`,
  },
  {
    type: "robinhood",
    name: "Robinhood",
    icon: "/robinhood-logo.png",
    downloadUrl: "https://robinhood.com/us/en/support/articles/connect-to-dapps",
    // Robinhood Wallet ne publie pas de lien pour ouvrir une page dans son navigateur Web3 :
    // sur mobile, on explique à l'utilisateur d'ouvrir omdot.fun depuis l'onglet Web3 de l'app.
    mobileDeepLink: null,
  },
  {
    type: "metamask",
    name: "MetaMask",
    icon: "/logo-metamask.jpeg",
    downloadUrl: "https://metamask.io/download",
    mobileDeepLink: (url) =>
      `https://metamask.app.link/dapp/${encodeURIComponent(url.replace(/^https?:\/\//, ""))}`,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Wallet Standard (Trust, Robinhood, Solflare, Backpack… s'y enregistrent aussi) ───────────────
// Protocole https://github.com/wallet-standard/wallet-standard, sans dépendance : les wallets s'annoncent
// par l'événement « wallet-standard:register-wallet » et répondent à « wallet-standard:app-ready ».

type StdAccount = { address: string; publicKey: Uint8Array; chains: readonly string[] };
type StdWallet = {
  name: string;
  chains: readonly string[];
  accounts: readonly StdAccount[];
  features: Record<string, Record<string, (...a: unknown[]) => Promise<unknown>>>;
};

const stdWallets: StdWallet[] = [];
let stdListening = false;
function registerStd(...ws: StdWallet[]) {
  for (const w of ws) if (w && !stdWallets.includes(w)) stdWallets.push(w);
  return () => {};
}
function startStdListening() {
  if (stdListening || typeof window === "undefined") return;
  stdListening = true;
  const api = Object.freeze({ register: registerStd });
  window.addEventListener("wallet-standard:register-wallet", (e) => {
    try { (e as CustomEvent<(a: typeof api) => void>).detail(api); } catch { /* wallet en erreur : ignoré */ }
  });
  try { window.dispatchEvent(new CustomEvent("wallet-standard:app-ready", { detail: api })); } catch { /* ignore */ }
}
startStdListening();

function findStdWallet(re: RegExp): StdWallet | null {
  startStdListening();
  return stdWallets.find((w) => re.test(w.name) && w.chains?.some((c) => c.startsWith("solana:")) && w.features?.["standard:connect"]) ?? null;
}

type AnyTx = { serialize: (o?: { requireAllSignatures?: boolean; verifySignatures?: boolean }) => Uint8Array | Buffer; version?: unknown };

function serializeTx(tx: unknown): Uint8Array {
  const t = tx as AnyTx;
  // Transaction « legacy » : accepter une signature manquante (le wallet la pose) ; VersionedTransaction : serialize()
  return Uint8Array.from("version" in (t as object) ? t.serialize() : t.serialize({ requireAllSignatures: false, verifySignatures: false }));
}

async function deserializeLike<T>(original: T, bytes: Uint8Array): Promise<T> {
  const web3 = await import("@solana/web3.js");
  return ("version" in (original as object)
    ? web3.VersionedTransaction.deserialize(bytes)
    : web3.Transaction.from(bytes)) as unknown as T;
}

/** Présente un wallet Wallet Standard avec la même interface que les wallets injectés (window.solana…). */
function standardToProvider(w: StdWallet): SolanaProvider {
  let account: StdAccount | null = w.accounts?.[0] ?? null;
  const pk = () => (account ? { toString: () => account!.address } : undefined);
  const chain = "solana:mainnet";
  const f = w.features;
  const provider: SolanaProvider = {
    get publicKey() { return pk(); },
    get isConnected() { return !!account; },
    connect: async () => {
      const r = (await f["standard:connect"].connect()) as { accounts?: StdAccount[] };
      account = r?.accounts?.[0] ?? w.accounts?.[0] ?? null;
      if (!account) throw new Error("No account returned by the wallet.");
      return { publicKey: pk() };
    },
    disconnect: f["standard:disconnect"] ? async () => { await f["standard:disconnect"].disconnect(); account = null; } : undefined,
    signMessage: f["solana:signMessage"] ? async (message: Uint8Array) => {
      if (!account) throw new Error("Wallet not connected.");
      const out = (await f["solana:signMessage"].signMessage({ account, message })) as { signature: Uint8Array }[];
      return { signature: out[0].signature };
    } : undefined,
    signTransaction: f["solana:signTransaction"] ? async <T,>(tx: T) => {
      if (!account) throw new Error("Wallet not connected.");
      const out = (await f["solana:signTransaction"].signTransaction({ account, transaction: serializeTx(tx), chain })) as { signedTransaction: Uint8Array }[];
      return deserializeLike(tx, out[0].signedTransaction);
    } : undefined,
    signAndSendTransaction: f["solana:signAndSendTransaction"] ? async <T,>(tx: T, options?: object) => {
      if (!account) throw new Error("Wallet not connected.");
      const out = (await f["solana:signAndSendTransaction"].signAndSendTransaction({ account, transaction: serializeTx(tx), chain, options })) as { signature: Uint8Array }[];
      return { signature: bs58.encode(out[0].signature) };
    } : undefined,
  };
  return provider;
}

// ─── Normalisation des wallets injectés ─────────────────────────────────────────────────────────
// Les wallets ne renvoient pas tous la même chose :
//  - signAndSendTransaction : { signature: string } (Phantom, Solflare), une chaîne seule, ou des octets ;
//  - signMessage : { signature: Uint8Array } (Phantom) ou directement un Uint8Array (Solflare, Backpack, Trust) ;
//  - connect : la clé publique est parfois seulement dans la valeur renvoyée.
// Tout le site lit le format de Phantom : on y ramène les autres ici, à un seul endroit.

function sigToString(r: unknown): string {
  const v = r && typeof r === "object" && "signature" in (r as object) ? (r as { signature: unknown }).signature : r;
  if (typeof v === "string") return v;
  if (v instanceof Uint8Array) return bs58.encode(v);
  if (Array.isArray(v)) return bs58.encode(Uint8Array.from(v as number[]));
  throw new Error("The wallet did not return a transaction signature.");
}

function sigToBytes(r: unknown): Uint8Array {
  const v = r && typeof r === "object" && !(r instanceof Uint8Array) && "signature" in (r as object) ? (r as { signature: unknown }).signature : r;
  if (v instanceof Uint8Array) return v;
  if (Array.isArray(v)) return Uint8Array.from(v as number[]);
  if (typeof v === "string") return bs58.decode(v);
  if (v && typeof v === "object" && "data" in (v as object)) return Uint8Array.from((v as { data: number[] }).data);
  throw new Error("The wallet did not return a message signature.");
}

const normalized = new WeakMap<object, SolanaProvider>();

export function normalizeSolanaProvider(p: SolanaProvider): SolanaProvider {
  const hit = normalized.get(p);
  if (hit) return hit;
  let lastKey: SolanaPublicKey | undefined;
  const proxy = new Proxy(p, {
    get(target, prop, receiver) {
      const t = target as unknown as Record<string | symbol, unknown>;
      if (prop === "publicKey") return (t.publicKey as SolanaPublicKey | undefined) ?? lastKey;
      if (prop === "connect") return async (opts?: { onlyIfTrusted?: boolean }) => {
        const r = await target.connect(opts);
        lastKey = r?.publicKey ?? target.publicKey ?? lastKey;
        return { ...(r ?? {}), publicKey: lastKey };
      };
      if (prop === "signMessage" && typeof target.signMessage === "function") return async (m: Uint8Array, d?: "hex" | "utf8") => {
        // Certains wallets refusent le 2e argument : on réessaie sans.
        const r = await (d ? target.signMessage!(m, d) : target.signMessage!(m)).catch((e: unknown) => {
          if (d) return target.signMessage!(m);
          throw e;
        });
        return { signature: sigToBytes(r) };
      };
      if (prop === "signAndSendTransaction" && typeof target.signAndSendTransaction === "function") return async <T,>(tx: T, o?: object) => {
        const r = await target.signAndSendTransaction!(tx, o as never);
        return { signature: sigToString(r) };
      };
      const v = Reflect.get(target, prop, receiver);
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
  });
  normalized.set(p, proxy);
  return proxy;
}

const stdProviders = new WeakMap<StdWallet, SolanaProvider>();
function fromStd(re: RegExp): SolanaProvider | null {
  const w = findStdWallet(re);
  if (!w) return null;
  let prov = stdProviders.get(w);
  if (!prov) { prov = standardToProvider(w); stdProviders.set(w, prov); }
  return prov;
}

type Flags = { isTrust?: boolean; isTrustWallet?: boolean; isRobinhood?: boolean; isSolflare?: boolean; isBackpack?: boolean };

function rawProviderByType(type: WalletType): SolanaProvider | null {
  if (typeof window === "undefined") return null;
  const w = window as WindowWithWallets;
  const sol = w.solana as (SolanaProvider & Flags) | undefined;
  switch (type) {
    case "phantom":
      return w.phantom?.solana ?? (sol?.isPhantom ? sol : null) ?? fromStd(/^phantom$/i);
    case "solflare":
      return w.solflare ?? (sol?.isSolflare ? sol : null) ?? fromStd(/solflare/i);
    case "backpack":
      return w.backpack ?? (sol?.isBackpack ? sol : null) ?? fromStd(/backpack/i);
    case "trustwallet":
      // Extension : window.trustwallet.solana ; navigateur de l'app : window.solana (isTrust / isTrustWallet) ; sinon Wallet Standard
      return w.trustwallet?.solana ?? (sol?.isTrust || sol?.isTrustWallet ? sol : null) ?? fromStd(/trust/i);
    case "robinhood":
      // Navigateur Web3 de l'app Robinhood Wallet : fournisseur injecté ou Wallet Standard
      return w.robinhood?.solana ?? (sol?.isRobinhood ? sol : null) ?? fromStd(/robinhood/i);
    case "metamask":
      // EIP-6963 (MetaMask / Rabby / Coinbase) avec repli sur window.ethereum ; shim pour le test « detected »
      return getEvmProvider() as unknown as SolanaProvider | null;
    default:
      return null;
  }
}

/** Fournisseur du wallet choisi, toujours au format de Phantom (voir normalizeSolanaProvider). */
export function getProviderByType(type: WalletType): SolanaProvider | null {
  const p = rawProviderByType(type);
  if (!p || type === "metamask") return p;
  return normalizeSolanaProvider(p);
}

export function getAvailableWallets(): WalletInfo[] {
  return WALLET_CATALOG.map((w) => ({
    ...w,
    detected: getProviderByType(w.type) !== null,
  })).sort((a, b) => (b.detected ? 1 : 0) - (a.detected ? 1 : 0));
}

export const WALLET_COLORS: Record<WalletType, string> = {
  phantom:     "bg-[#4e44ce]",
  solflare:    "bg-[#fc5a20]",
  backpack:    "bg-[#e33e3f]",
  trustwallet: "bg-[#3375bb]",
  robinhood:   "bg-[#00c805]",
  metamask:    "bg-[#e4761b]",
};
