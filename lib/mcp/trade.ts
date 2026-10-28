/**
 * Trading de tokens OMdotfun par un agent, non custodial : le serveur prépare la transaction pour le wallet
 * de l'agent, l'agent la signe avec sa propre clé, puis l'envoie lui-même ou via trade_submit.
 *  - Solana : tokens encore sur la bonding curve Meteora (payés en SOL).
 *  - Arc    : tokens V2 encore sur la bonding curve (payés en USDC natif).
 * Garde-fous : plafond par trade, slippage borné, limite horaire par wallet, devis obligatoire.
 */
import { Connection, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { createPublicClient, encodeFunctionData, http, parseAbi, parseTransaction } from "viem";
import { createAdminClient } from "@/lib/supabase/server";
import { arc } from "@/lib/arc-chain";
import { BONDING_CURVE_V2_ABI, ARC_DIRECT_ROUTER_ABI, resolveArcPoolFee } from "@/lib/arc-launchpad";
import { directPoolFee } from "@/lib/arc-trades";
import { POST as dbcSwapRoute } from "@/app/api/launchpad/dbc-swap/route";
import { rateHit } from "@/lib/rate-limit";

export class TradeError extends Error {}

export const MAX_BUY_SOL = 5;
export const MAX_BUY_USDC = 500;
const MAX_SLIPPAGE_BPS = 1000;
const DBC_PROGRAM = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";
const ARC_RPC = "https://rpc.mainnet.arc.io";
const ERC20 = parseAbi(["function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"]);

const solConn = () => new Connection(process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com", "confirmed");
const arcClient = () => createPublicClient({ chain: arc, transport: http(ARC_RPC) });

type Token = { id: string; name: string; ticker: string; chain: "solana" | "arc"; status: string; is_hidden: boolean | null; mint_address: string | null; pool_address: string | null; arc_launch_id: string | null; stock_symbol: string | null };

async function loadToken(id: string): Promise<Token> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (createAdminClient() as any)
    .from("launchpad_tokens")
    .select("id, name, ticker, chain, status, is_hidden, mint_address, pool_address, arc_launch_id, stock_symbol")
    .eq("id", id).maybeSingle();
  if (!data || data.is_hidden) throw new TradeError("Token not found");
  if (data.status === "graduated") throw new TradeError("This token has graduated: trade it on a DEX (Meteora / Uniswap)");
  if (data.status !== "active" && data.status !== "graduating") throw new TradeError("This token is not tradable yet");
  return data as Token;
}

const pow10 = (d: number) => 10n ** BigInt(d);
function toUnits(amount: number, decimals: number): bigint {
  const [i, f = ""] = amount.toFixed(decimals).split(".");
  return BigInt(i) * pow10(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0");
}
const fromUnits = (v: bigint, d: number) => Number(v) / 10 ** d;

export type PrepareArgs = { wallet: string; token_id: string; side: "buy" | "sell"; amount: number; slippage_bps?: number };

export async function prepareTrade(a: PrepareArgs) {
  if (a.side !== "buy" && a.side !== "sell") throw new TradeError("side must be buy or sell");
  if (!Number.isFinite(a.amount) || a.amount <= 0) throw new TradeError("amount must be a positive number");
  const slip = Math.min(MAX_SLIPPAGE_BPS, Math.max(10, Math.round(a.slippage_bps ?? 100)));
  if (!(await rateHit(`trade:${a.wallet.toLowerCase()}`, 30, 3600_000))) throw new TradeError("Too many trades, try again later (30 per hour)");
  const t = await loadToken(a.token_id);

  if (t.chain === "solana") {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a.wallet)) throw new TradeError("A Solana wallet is required for this token");
    if (t.stock_symbol) throw new TradeError("xStock-paired tokens can only be traded on the website for now");
    if (!t.pool_address || !t.mint_address) throw new TradeError("Pool not ready");
    if (a.side === "buy" && a.amount > MAX_BUY_SOL) throw new TradeError(`Max ${MAX_BUY_SOL} SOL per trade`);
    let decimals = 9;
    if (a.side === "sell") {
      const sup = await solConn().getTokenSupply(new PublicKey(t.mint_address));
      decimals = sup.value.decimals;
    }
    const amountIn = Number(toUnits(a.amount, decimals));
    if (!Number.isSafeInteger(amountIn) || amountIn < 1) throw new TradeError("amount is too small or too large");
    const res = await dbcSwapRoute(new Request("http://internal/api/launchpad/dbc-swap", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ poolAddress: t.pool_address, mintAddress: t.mint_address, walletAddress: a.wallet, amountIn, slippageBps: slip, swapBaseForQuote: a.side === "sell" }),
    }));
    const j = (await res.json().catch(() => ({}))) as { txBase64?: string; estimatedOut?: number; error?: string };
    if (!res.ok || !j.txBase64) throw new TradeError(j.error ?? "Could not build the trade");
    if (!j.estimatedOut || j.estimatedOut <= 0) throw new TradeError("No price quote available right now, try again");
    const outDecimals = a.side === "buy" ? (await solConn().getTokenSupply(new PublicKey(t.mint_address))).value.decimals : 9;
    return {
      chain: "solana",
      token: { id: t.id, name: t.name, ticker: t.ticker },
      side: a.side,
      amount_in: a.amount,
      amount_in_unit: a.side === "buy" ? "SOL" : t.ticker,
      estimated_out: fromUnits(BigInt(j.estimatedOut), outDecimals),
      estimated_out_unit: a.side === "buy" ? t.ticker : "SOL",
      slippage_bps: slip,
      tx_base64: j.txBase64,
      next: "Sign tx_base64 with the wallet key (it expires in about 60 seconds), then call trade_submit { chain: \"solana\", signed_tx_base64 } or send it yourself.",
    };
  }

  // Arc
  if (!/^0x[0-9a-fA-F]{40}$/.test(a.wallet)) throw new TradeError("An Arc (0x) wallet is required for this token");
  if (!t.arc_launch_id || !t.mint_address || t.arc_launch_id.toLowerCase() === t.mint_address.toLowerCase()) throw new TradeError("Only Arc V2 tokens can be traded by agents for now");
  const curve = t.arc_launch_id as `0x${string}`;
  const token = t.mint_address as `0x${string}`;
  const from = a.wallet.toLowerCase() as `0x${string}`;
  const pc = arcClient();
  // Pool Uniswap V4 : lancement direct, ou token de courbe gradué (pool à 0,50 %)
  const router = (process.env.NEXT_PUBLIC_ARC_DIRECT_ROUTER || "") as `0x${string}` | "";
  const dFee = await directPoolFee(curve.toLowerCase());
  const isGraduated = dFee === null && Boolean(await pc.readContract({ address: curve, abi: BONDING_CURVE_V2_ABI, functionName: "graduated" }));
  const poolFee = dFee ?? (isGraduated ? await resolveArcPoolFee(pc, curve, true) : null);
  if (poolFee !== null) {
    if (!router) throw new TradeError("This token trades on Uniswap V4 and the in-app router is not configured yet");
    if (a.side === "buy") {
      if (a.amount > MAX_BUY_USDC) throw new TradeError(`Max ${MAX_BUY_USDC} USDC per trade`);
      const value = toUnits(a.amount, 18);
      const { result: out } = await pc.simulateContract({ address: router, abi: ARC_DIRECT_ROUTER_ABI, functionName: "quoteBuy", args: [token, poolFee, value] });
      if (out <= 0n) throw new TradeError("No price quote available right now, try again");
      const minOut = (out * BigInt(10_000 - slip)) / 10_000n;
      return {
        chain: "arc", chain_id: 5042, rpc: ARC_RPC,
        token: { id: t.id, name: t.name, ticker: t.ticker },
        side: "buy", amount_in: a.amount, amount_in_unit: "USDC",
        estimated_out: fromUnits(out, 18), estimated_out_unit: t.ticker, slippage_bps: slip,
        transactions: [{ from, to: router, value: `0x${value.toString(16)}`, data: encodeFunctionData({ abi: ARC_DIRECT_ROUTER_ABI, functionName: "buy", args: [token, poolFee, minOut, from] }) }],
        next: "Sign and send the transaction with the wallet key (chain 5042), or sign it and call trade_submit { chain: \"arc\", signed_tx }.",
      };
    }
    const tokensIn = toUnits(a.amount, 18);
    const bal = (await pc.readContract({ address: token, abi: ERC20, functionName: "balanceOf", args: [from] })) as bigint;
    if (bal < tokensIn) throw new TradeError("Not enough tokens in this wallet");
    const { result: out } = await pc.simulateContract({ address: router, abi: ARC_DIRECT_ROUTER_ABI, functionName: "quoteSell", args: [token, poolFee, tokensIn] });
    if (out <= 0n) throw new TradeError("No price quote available right now, try again");
    const minOut = (out * BigInt(10_000 - slip)) / 10_000n;
    const allowance = (await pc.readContract({ address: token, abi: ERC20, functionName: "allowance", args: [from, router] })) as bigint;
    const txs = [];
    if (allowance < tokensIn) txs.push({ from, to: token, value: "0x0", data: encodeFunctionData({ abi: ERC20, functionName: "approve", args: [router, tokensIn] }) });
    txs.push({ from, to: router, value: "0x0", data: encodeFunctionData({ abi: ARC_DIRECT_ROUTER_ABI, functionName: "sell", args: [token, poolFee, tokensIn, minOut, from] }) });
    return {
      chain: "arc", chain_id: 5042, rpc: ARC_RPC,
      token: { id: t.id, name: t.name, ticker: t.ticker },
      side: "sell", amount_in: a.amount, amount_in_unit: t.ticker,
      estimated_out: fromUnits(out, 18), estimated_out_unit: "USDC", slippage_bps: slip,
      transactions: txs,
      next: "Sign and send each transaction in order (approve first if present), or call trade_submit { chain: \"arc\", signed_tx } for each.",
    };
  }

  if (a.side === "buy") {
    if (a.amount > MAX_BUY_USDC) throw new TradeError(`Max ${MAX_BUY_USDC} USDC per trade`);
    const value = toUnits(a.amount, 18);
    const [tokensOut] = (await pc.readContract({ address: curve, abi: BONDING_CURVE_V2_ABI, functionName: "quoteBuy", args: [value] })) as readonly [bigint, bigint];
    if (tokensOut <= 0n) throw new TradeError("No price quote available right now, try again");
    const minOut = (tokensOut * BigInt(10_000 - slip)) / 10_000n;
    return {
      chain: "arc", chain_id: 5042, rpc: ARC_RPC,
      token: { id: t.id, name: t.name, ticker: t.ticker },
      side: "buy", amount_in: a.amount, amount_in_unit: "USDC",
      estimated_out: fromUnits(tokensOut, 18), estimated_out_unit: t.ticker, slippage_bps: slip,
      transactions: [{ from, to: curve, value: `0x${value.toString(16)}`, data: encodeFunctionData({ abi: BONDING_CURVE_V2_ABI, functionName: "buy", args: [minOut] }) }],
      next: "Sign and send each transaction in order with the wallet key (chain 5042), or sign them and call trade_submit { chain: \"arc\", signed_tx } for each.",
    };
  }

  const tokensIn = toUnits(a.amount, 18);
  const bal = (await pc.readContract({ address: token, abi: ERC20, functionName: "balanceOf", args: [from] })) as bigint;
  if (bal < tokensIn) throw new TradeError("Not enough tokens in this wallet");
  const [usdcOut] = (await pc.readContract({ address: curve, abi: BONDING_CURVE_V2_ABI, functionName: "quoteSell", args: [tokensIn] })) as readonly [bigint, bigint];
  if (usdcOut <= 0n) throw new TradeError("No price quote available right now, try again");
  const minOut = (usdcOut * BigInt(10_000 - slip)) / 10_000n;
  const allowance = (await pc.readContract({ address: token, abi: ERC20, functionName: "allowance", args: [from, curve] })) as bigint;
  const txs = [];
  if (allowance < tokensIn) txs.push({ from, to: token, value: "0x0", data: encodeFunctionData({ abi: ERC20, functionName: "approve", args: [curve, tokensIn] }) });
  txs.push({ from, to: curve, value: "0x0", data: encodeFunctionData({ abi: BONDING_CURVE_V2_ABI, functionName: "sell", args: [tokensIn, minOut] }) });
  return {
    chain: "arc", chain_id: 5042, rpc: ARC_RPC,
    token: { id: t.id, name: t.name, ticker: t.ticker },
    side: "sell", amount_in: a.amount, amount_in_unit: t.ticker,
    estimated_out: fromUnits(usdcOut, 18), estimated_out_unit: "USDC", slippage_bps: slip,
    transactions: txs,
    next: "Sign and send each transaction in order (approve first if present), or call trade_submit { chain: \"arc\", signed_tx } for each.",
  };
}

/** Relaie une transaction signée, uniquement si elle vise un contrat de trading OMdotfun. */
export async function submitTrade(a: { chain: string; signed_tx_base64?: string; signed_tx?: string }) {
  if (a.chain === "solana") {
    if (!a.signed_tx_base64) throw new TradeError("signed_tx_base64 is required");
    const raw = Buffer.from(a.signed_tx_base64, "base64");
    let programs: string[] = [];
    try {
      const vtx = VersionedTransaction.deserialize(raw);
      programs = vtx.message.compiledInstructions.map((ix) => vtx.message.staticAccountKeys[ix.programIdIndex]?.toBase58() ?? "");
    } catch {
      try { programs = Transaction.from(raw).instructions.map((ix) => ix.programId.toBase58()); } catch { throw new TradeError("Invalid transaction"); }
    }
    if (!programs.includes(DBC_PROGRAM)) throw new TradeError("Only OMdotfun bonding-curve trades can be submitted here");
    const conn = solConn();
    const sig = await conn.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 3 }).catch((e: unknown) => {
      throw new TradeError(e instanceof Error ? (e.message.match(/Error Message: ([^."]+)/)?.[1] ?? e.message.slice(0, 160)) : "Transaction failed");
    });
    return { signature: sig, explorer: `https://solscan.io/tx/${sig}` };
  }
  if (a.chain === "arc") {
    const raw = a.signed_tx as `0x${string}` | undefined;
    if (!raw || !/^0x[0-9a-fA-F]+$/.test(raw)) throw new TradeError("signed_tx (0x…) is required");
    let to: string | undefined;
    try { to = parseTransaction(raw).to?.toLowerCase(); } catch { throw new TradeError("Invalid transaction"); }
    if (!to) throw new TradeError("Invalid transaction");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (createAdminClient() as any).from("launchpad_tokens").select("id").eq("chain", "arc").or(`arc_launch_id.ilike.${to},mint_address.ilike.${to}`).limit(1);
    if (!data?.length) throw new TradeError("Only OMdotfun bonding-curve trades can be submitted here");
    const hash = await arcClient().sendRawTransaction({ serializedTransaction: raw }).catch((e: unknown) => {
      throw new TradeError(e instanceof Error ? e.message.slice(0, 160) : "Transaction failed");
    });
    return { hash };
  }
  throw new TradeError("chain must be solana or arc");
}
