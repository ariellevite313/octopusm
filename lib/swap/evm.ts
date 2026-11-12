/**
 * Swaps EVM du Terminal (Base, BNB Chain, HyperEVM) via l'API 0x (AllowanceHolder).
 * Frais OM 0,3 % pris par 0x dans la même transaction, en jeton natif, vers le portefeuille EVM de la plateforme.
 * Paires : jeton natif (ETH / BNB / HYPE) contre le token. Le portefeuille de l'utilisateur signe toujours.
 */
export type EvmChain = "base" | "bnb" | "hyperliquid";
export const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export const EVM_CHAINS: Record<EvmChain, { id: number; name: string; native: string; rpc: string; explorer: string; logo: string }> = {
  base: { id: 8453, name: "Base", native: "ETH", rpc: "https://mainnet.base.org", explorer: "https://basescan.org", logo: "/ethereum.png" },
  bnb: { id: 56, name: "BNB Chain", native: "BNB", rpc: "https://bsc-dataseed.binance.org", explorer: "https://bscscan.com", logo: "/chains/bnb.png" },
  hyperliquid: { id: 999, name: "HyperEVM", native: "HYPE", rpc: "https://rpc.hyperliquid.xyz/evm", explorer: "https://hyperevmscan.io", logo: "/chains/hyperliquid.png" },
};
export const isEvmChain = (c: unknown): c is EvmChain => typeof c === "string" && c in EVM_CHAINS;

import { MAJOR_FEE_BPS, isMajorEvm } from "./majors";
export const EVM_FEE_BPS = 30;
/** Frais OM d'un token EVM : 0,03 % sur les majeurs, 0,3 % sinon. */
export const evmFeeBps = (chain: string, token: string) => (isMajorEvm(chain, token) ? MAJOR_FEE_BPS : EVM_FEE_BPS);
export const EVM_FEE_WALLET = process.env.EVM_FEE_WALLET ?? process.env.NEXT_PUBLIC_ARC_TREASURY_ADDRESS ?? "0xf1173b875829293F7f02C20f177242a556f302fA";

export const isAddr = (s: unknown): s is string => typeof s === "string" && /^0x[0-9a-fA-F]{40}$/.test(s);

export type EvmSwapInput = { chain: EvmChain; side: "buy" | "sell"; token: string; amount: string; slippageBps: number; taker: string | null };

export function checkEvmInput(b: Record<string, unknown>, taker: string | null): { ok: true; v: EvmSwapInput } | { ok: false; error: string } {
  if (!isEvmChain(b.chain)) return { ok: false, error: "Unsupported network" };
  if (!isAddr(b.token) || String(b.token).toLowerCase() === NATIVE.toLowerCase()) return { ok: false, error: "Invalid token" };
  const side = b.side === "sell" ? "sell" : b.side === "buy" ? "buy" : null;
  if (!side) return { ok: false, error: "Invalid side" };
  const amount = String(b.amount ?? "");
  if (!/^[1-9]\d{0,40}$/.test(amount)) return { ok: false, error: "Invalid amount" };
  const slip = Number(b.slippageBps ?? 100);
  if (!Number.isInteger(slip) || slip < 10 || slip > 2000) return { ok: false, error: "Slippage must be between 0.1% and 20%" };
  return { ok: true, v: { chain: b.chain, side, token: b.token as string, amount, slippageBps: slip, taker } };
}

/** Paramètres 0x : vente du natif (achat) ou du token (vente), frais OM en natif. */
export function zeroXParams(v: EvmSwapInput): URLSearchParams {
  const p = new URLSearchParams({
    chainId: String(EVM_CHAINS[v.chain].id),
    sellToken: v.side === "buy" ? NATIVE : v.token,
    buyToken: v.side === "buy" ? v.token : NATIVE,
    sellAmount: v.amount,
    slippageBps: String(v.slippageBps),
    swapFeeRecipient: EVM_FEE_WALLET,
    swapFeeBps: String(evmFeeBps(v.chain, v.token)),
    swapFeeToken: NATIVE,
  });
  if (v.taker) p.set("taker", v.taker);
  return p;
}

/** Contrats AllowanceHolder de 0x : seules adresses autorisées comme destinataire et comme « spender ». */
export const ALLOWANCE_HOLDERS = new Set(["0x0000000000001ff3684f28c67538d4d072c22734", "0x0000005e88410ccdfade4a5efae4b49562"]);

export class EvmSwapError extends Error {
  constructor(msg: string, public status = 400) { super(msg); }
}

type ZeroXRes = {
  liquidityAvailable?: boolean; buyAmount?: string; minBuyAmount?: string; sellAmount?: string;
  issues?: { allowance?: { spender: string; actual: string } | null; balance?: { actual: string; expected: string } | null };
  transaction?: { to: string; data: string; value: string; gas?: string | null; gasPrice?: string };
  route?: { fills?: { source?: string }[] };
  fees?: { integratorFee?: { amount?: string } | null; integratorFees?: { amount?: string }[] | null };
  name?: string; message?: string;
};

export type EvmQuote = {
  buyAmount: string; minBuyAmount: string; sellAmount: string; feeBps: number; feeNative: string | null; route: string[];
  allowanceSpender: string | null; balanceShort: boolean;
  tx: { to: string; data: string; value: string; gas: string | null } | null;
};

/** price : estimation sans transaction ; quote : transaction prête à signer (taker requis). */
export async function zeroX(v: EvmSwapInput, mode: "price" | "quote"): Promise<EvmQuote> {
  const key = process.env.ZEROX_API_KEY;
  if (!key) throw new EvmSwapError("Swap service not configured", 503);
  if (mode === "quote" && !v.taker) throw new EvmSwapError("Connect an EVM wallet to swap");
  let r: Response;
  try {
    r = await fetch(`https://api.0x.org/swap/allowance-holder/${mode}?${zeroXParams(v)}`, {
      headers: { "0x-api-key": key, "0x-version": "v2" }, signal: AbortSignal.timeout(10_000), cache: "no-store",
    });
  } catch { throw new EvmSwapError("Swap service unreachable, try again", 503); }
  const j = (await r.json().catch(() => ({}))) as ZeroXRes;
  if (r.status === 429) throw new EvmSwapError("Too many requests, try again in a few seconds", 429);
  if (r.status === 401 || r.status === 403) throw new EvmSwapError("Swap service not configured", 503);
  if (!r.ok) throw new EvmSwapError("Could not get a price for this swap");
  if (j.liquidityAvailable === false || !j.buyAmount) throw new EvmSwapError("No route for this pair right now");
  const spender = j.issues?.allowance?.spender ?? null;
  if (spender && !ALLOWANCE_HOLDERS.has(spender.toLowerCase())) throw new EvmSwapError("Unexpected swap contract, try again later", 502);
  if (mode === "quote" && j.transaction && !ALLOWANCE_HOLDERS.has(j.transaction.to.toLowerCase())) throw new EvmSwapError("Unexpected swap contract, try again later", 502);
  const fee = j.fees?.integratorFees?.[0]?.amount ?? j.fees?.integratorFee?.amount ?? null;
  return {
    buyAmount: j.buyAmount, minBuyAmount: j.minBuyAmount ?? j.buyAmount, sellAmount: j.sellAmount ?? v.amount,
    feeBps: evmFeeBps(v.chain, v.token), feeNative: fee, route: [...new Set((j.route?.fills ?? []).map((f) => f.source).filter((x): x is string => !!x))].slice(0, 4),
    allowanceSpender: spender,
    balanceShort: !!j.issues?.balance,
    tx: mode === "quote" && j.transaction ? { to: j.transaction.to, data: j.transaction.data, value: j.transaction.value, gas: j.transaction.gas ?? null } : null,
  };
}
