"use client";
/**
 * Compte EVM pour trader sur Base, BNB Chain et HyperEVM quand on est connecté à OM avec un wallet Solana (Phantom, Solflare…).
 * Wallet EVM du navigateur s'il y en a un (MetaMask, Rabby, Phantom EVM), sinon WalletConnect (QR code ou app du wallet).
 * Ce compte ne sert qu'à signer les échanges : la connexion OM reste celle du wallet Solana.
 */
import { EVM_CHAINS } from "@/lib/swap/evm";
import { getEvmProvider, type EvmProvider } from "./evm-provider";
import { WC_PROJECT_ID } from "./walletconnect";

export type TradingAccount = { address: string; provider: EvmProvider; kind: "injected" | "walletconnect" };
const KEY = "omdot_evm_trader";
const METHODS = ["eth_sendTransaction", "personal_sign", "wallet_switchEthereumChain", "wallet_addEthereumChain"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let wc: any = null;

function injected(): EvmProvider | null {
  return getEvmProvider() ?? (window as unknown as { phantom?: { ethereum?: EvmProvider } }).phantom?.ethereum ?? null;
}

async function wcProvider() {
  if (wc) return wc;
  if (!WC_PROJECT_ID) throw new Error("Wallet connection is not configured yet");
  const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
  const ids = Object.values(EVM_CHAINS).map((c) => c.id);
  wc = await EthereumProvider.init({
    projectId: WC_PROJECT_ID,
    optionalChains: [1, ...ids] as [number, ...number[]],
    optionalMethods: METHODS,
    showQrModal: true,
    rpcMap: Object.fromEntries(Object.values(EVM_CHAINS).map((c) => [c.id, c.rpc])),
    metadata: { name: "OMdotfun", description: "OMdotfun", url: window.location.origin, icons: [`${window.location.origin}/omdot-icon.png`] },
  });
  return wc;
}

function remember(a: TradingAccount) { try { localStorage.setItem(KEY, JSON.stringify({ kind: a.kind, address: a.address })); } catch { /* ignore */ } }

/** Connecte un wallet EVM (demande l'accord de l'utilisateur). */
export async function connectEvmTrader(): Promise<TradingAccount> {
  const inj = injected();
  if (inj) {
    const [address] = (await inj.request({ method: "eth_requestAccounts" })) as string[];
    if (!address) throw new Error("No account returned by the wallet");
    const a: TradingAccount = { address, provider: inj, kind: "injected" };
    remember(a);
    return a;
  }
  const p = await wcProvider();
  if (!p.session) await p.connect();
  const address = p.accounts?.[0] as string | undefined;
  if (!address) throw new Error("No account returned by the wallet");
  const a: TradingAccount = { address, provider: p as EvmProvider, kind: "walletconnect" };
  remember(a);
  return a;
}

/** Retrouve la connexion précédente sans rien demander (null si elle n'existe plus). */
export async function restoreEvmTrader(): Promise<TradingAccount | null> {
  let saved: { kind?: string; address?: string } | null = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { /* ignore */ }
  if (!saved?.address) return null;
  try {
    if (saved.kind === "injected") {
      const inj = injected();
      const accs = inj ? ((await inj.request({ method: "eth_accounts" })) as string[]) : [];
      if (inj && accs.some((x) => x.toLowerCase() === saved!.address!.toLowerCase())) return { address: saved.address, provider: inj, kind: "injected" };
    } else if (saved.kind === "walletconnect" && WC_PROJECT_ID) {
      const p = await wcProvider();
      const a = p.session ? (p.accounts?.[0] as string | undefined) : undefined;
      if (a) return { address: a, provider: p as EvmProvider, kind: "walletconnect" };
    }
  } catch { /* session expirée */ }
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return null;
}

export async function disconnectEvmTrader(): Promise<void> {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  try { if (wc?.session) await wc.disconnect(); } catch { /* ignore */ }
}
