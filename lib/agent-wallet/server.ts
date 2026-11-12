/**
 * Wallets autonomes des IA connectées.
 * L'IA agit seule via le MCP connecté ; OM vérifie la pause, les permissions et les plafonds (en SQL, sous verrou),
 * puis signe avec la clé du wallet de l'IA (déchiffrée en mémoire le temps de la signature).
 * Les retraits ne partent que vers le wallet de l'humain qui a connecté l'IA.
 */
import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction, VersionedTransaction, type Keypair } from "@solana/web3.js";
import { createPublicClient, createWalletClient, defineChain, encodeFunctionData, erc20Abi, http, type Hex } from "viem";
import { createAdminClient } from "@/lib/supabase/server";
import { solanaConnection } from "@/lib/solana/rpc";
import { arc } from "@/lib/arc-chain";
import { runAsAgent } from "@/lib/social/session";
import { SOL_MINT, USDC_MINT, ataOf, createAtaIdempotent } from "@/lib/swap/core";
import { refTransferIx } from "@/lib/swap/chill";
import { prepareTrade, submitTrade, TradeError } from "@/lib/mcp/trade";
import { ACTIONS, ActionError } from "@/lib/mcp/agent-actions";
import { POST as swapTxRoute } from "@/app/api/swap/tx/route";
import { POST as swapRecordRoute } from "@/app/api/swap/record/route";
import { POST as launchRoute } from "@/app/api/v1/launch/route";
import { POST as launchSubmitRoute } from "@/app/api/v1/launch/[id]/submit/route";
import { POST as launchConfirmRoute } from "@/app/api/v1/launch/[id]/confirm/route";
import { POST as predictRoute } from "@/app/api/pools/predict/route";
import { evmAccount, newWallets, solKeypair } from "@/lib/agent-wallet/keys";
import { checkEvmInput, EVM_CHAINS, EvmSwapError, isEvmChain, zeroX, type EvmChain } from "@/lib/swap/evm";
import { RESERVE_ERRORS, type AgentKind } from "@/lib/agent-wallet/limits";

export class AgentWalletError extends Error {}

export type AgentWallet = {
  id: string; owner: string; client_id: string; name: string;
  sol_address: string; sol_secret: string; evm_address: string; evm_secret: string;
  max_action_usd: number; max_day_usd: number; allow_trade: boolean; allow_launch: boolean; allow_bet: boolean; paused: boolean; created_at: string;
};
const PUBLIC_COLS = "id, owner, client_id, name, sol_address, evm_address, max_action_usd, max_day_usd, allow_trade, allow_launch, allow_bet, paused, created_at";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any;
const ARC_RPC = "https://rpc.mainnet.arc.io";
const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const TREASURY = process.env.NEXT_PUBLIC_TREASURY_ADDRESS ?? "EsR6usyjCzhgL6dZFqHRsw6pDh7CgvfHtkQzCybJMuCZ";
const LAUNCH_COST_SOL = 0.02; // frais de lancement + comptes, estimation pour le plafond
const MARKET_FEE_USDC = 0.5;

// ── Lecture ──────────────────────────────────────────────────────────────────

export async function walletForConnection(owner: string, clientId: string): Promise<AgentWallet | null> {
  const { data } = await db().from("agent_wallets").select("*").eq("owner", owner).eq("client_id", clientId).maybeSingle();
  return (data as AgentWallet) ?? null;
}
async function walletOfOwner(owner: string, id: string): Promise<AgentWallet> {
  const { data } = await db().from("agent_wallets").select("*").eq("owner", owner).eq("id", id).maybeSingle();
  if (!data) throw new AgentWalletError("AI wallet not found");
  return data as AgentWallet;
}

async function solPriceUsd(): Promise<number> {
  try {
    const r = await fetch("https://api.coinbase.com/v2/prices/SOL-USD/spot", { signal: AbortSignal.timeout(4000), cache: "no-store" });
    return Number(((await r.json()) as { data?: { amount?: string } }).data?.amount) || 0;
  } catch { return 0; }
}
async function solToUsd(sol: number): Promise<number> {
  const p = await solPriceUsd();
  if (!p) throw new AgentWalletError("SOL price unavailable right now, try again in a minute");
  return Math.round(sol * p * 100) / 100;
}

const CG_NATIVE: Record<EvmChain, string> = { base: "ETH", ethereum: "ETH", arbitrum: "ETH", bnb: "BNB", polygon: "POL", avalanche: "AVAX", hyperliquid: "HYPE" };
const evmChainDef = (c: EvmChain) => defineChain({ id: EVM_CHAINS[c].id, name: EVM_CHAINS[c].name, nativeCurrency: { name: EVM_CHAINS[c].native, symbol: EVM_CHAINS[c].native, decimals: 18 }, rpcUrls: { default: { http: [EVM_CHAINS[c].rpc] } } });
async function nativeUsd(c: EvmChain): Promise<number> {
  const sym = CG_NATIVE[c];
  try {
    const r = await fetch(`https://api.coinbase.com/v2/prices/${sym}-USD/spot`, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    const v = Number(((await r.json()) as { data?: { amount?: string } }).data?.amount) || 0;
    if (v) return v;
  } catch { /* repli ci-dessous */ }
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${sym}%20USDC`, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    const pair = ((await r.json()) as { pairs?: { baseToken?: { symbol?: string }; chainId?: string; priceUsd?: string }[] }).pairs?.find((x) => x.baseToken?.symbol === sym);
    return Number(pair?.priceUsd) || 0;
  } catch { return 0; }
}

export async function balances(w: Pick<AgentWallet, "sol_address" | "evm_address">) {
  const conn = solanaConnection();
  const owner = new PublicKey(w.sol_address);
  const evmChains = Object.keys(EVM_CHAINS) as EvmChain[];
  const [evm, lamports, usdc, arcUsdc] = await Promise.all([
    Promise.all(evmChains.map((c) => createPublicClient({ chain: evmChainDef(c), transport: http(EVM_CHAINS[c].rpc) }).getBalance({ address: w.evm_address as Hex }).then((v) => [c, Number(v) / 1e18] as const).catch(() => [c, null] as const))),
    conn.getBalance(owner).catch(() => null),
    conn.getTokenAccountBalance(ataOf(owner, new PublicKey(USDC_MINT))).then((r) => Number(r.value.uiAmount ?? 0)).catch(() => 0),
    createPublicClient({ chain: arc, transport: http(ARC_RPC) }).getBalance({ address: w.evm_address as Hex }).then((v) => Number(v) / 1e18).catch(() => null),
  ]);
  return { sol: lamports === null ? null : lamports / 1e9, usdc_solana: usdc, usdc_arc: arcUsdc, evm_native: Object.fromEntries(evm.map(([c, v]) => [c, { symbol: EVM_CHAINS[c].native, amount: v }])) };
}

// ── Création, réglages (humain) ─────────────────────────────────────────────

export async function createWallet(owner: string, clientId: string): Promise<AgentWallet> {
  const ex = await walletForConnection(owner, clientId);
  if (ex) return ex;
  const admin = db();
  const { data: tok } = await admin.from("oauth_tokens").select("id").eq("wallet", owner).eq("client_id", clientId).eq("revoked", false).limit(1).maybeSingle();
  if (!tok) throw new AgentWalletError("This assistant is not connected to your account");
  const { data: cl } = await admin.from("oauth_clients").select("client_name").eq("client_id", clientId).maybeSingle();
  const name = String(cl?.client_name ?? "AI").slice(0, 30);
  const keys = newWallets();
  const { data, error } = await admin.from("agent_wallets").insert({ owner, client_id: clientId, name, ...keys }).select("*").single();
  if (error) throw new AgentWalletError("Could not create the wallet");
  // Profil public de l'IA (badge « AI » et son créateur)
  const now = new Date().toISOString();
  for (const address of [keys.sol_address, keys.evm_address]) {
    await admin.from("wallets").insert({
      address, role: "user", status: "active", first_connected_at: now, last_connected_at: now, connection_count: 1,
      latest_activity_at: now, latest_activity_label: "AI wallet created", payment_count: 0, approved_payment_count: 0,
      pending_payment_count: 0, rejected_payment_count: 0, total_paid_usdc: 0, total_won_usdc: 0, total_lost_usdc: 0, total_claimed_usdc: 0,
      display_name: `${name} AI`.slice(0, 40), ai_owner: owner,
    }).then(() => {}, () => {});
  }
  return data as AgentWallet;
}

export async function updateWallet(owner: string, id: string, patch: Record<string, number | boolean>) {
  await walletOfOwner(owner, id);
  const { error } = await db().from("agent_wallets").update(patch).eq("id", id).eq("owner", owner);
  if (error) throw new AgentWalletError(error.message.includes("check") ? "Invalid limits" : "Could not save");
}

export async function listForOwner(owner: string) {
  const { data } = await db().from("agent_wallets").select(PUBLIC_COLS).eq("owner", owner).order("created_at");
  const rows = (data ?? []) as Omit<AgentWallet, "sol_secret" | "evm_secret">[];
  return Promise.all(rows.map(async (w) => {
    const [bal, acts, spent] = await Promise.all([
      balances(w),
      db().from("agent_wallet_actions").select("kind, amount_usd, status, summary, tx, error, created_at").eq("wallet_id", w.id).order("created_at", { ascending: false }).limit(20),
      spentToday(w.id),
    ]);
    return { ...w, balances: bal, spent_today_usd: spent, actions: acts.data ?? [] };
  }));
}

async function spentToday(id: string): Promise<number> {
  const start = new Date(); start.setUTCHours(0, 0, 0, 0);
  const { data } = await db().from("agent_wallet_actions").select("amount_usd").eq("wallet_id", id).neq("status", "failed").gte("created_at", start.toISOString());
  return ((data ?? []) as { amount_usd: number }[]).reduce((a, r) => a + Number(r.amount_usd), 0);
}

// ── Réservation et journal ───────────────────────────────────────────────────

async function reserve(w: AgentWallet, kind: AgentKind, usd: number, summary: string): Promise<string> {
  const { data, error } = await db().rpc("agent_wallet_reserve", { p_wallet: w.id, p_kind: kind, p_usd: usd, p_summary: summary });
  if (error) throw new AgentWalletError("Could not check the wallet limits");
  const r = data as { id?: string; error?: string; limit?: number; spent?: number };
  if (r.error) {
    let msg = RESERVE_ERRORS[r.error] ?? "Action refused";
    if (r.limit !== undefined) msg += ` Limit: $${r.limit}${r.spent !== undefined ? `, already spent today: $${Number(r.spent).toFixed(2)}` : ""}. This action: $${usd.toFixed(2)}.`;
    throw new AgentWalletError(msg);
  }
  return r.id!;
}
async function finish(id: string, ok: boolean, tx?: string | null, err?: string) {
  await db().from("agent_wallet_actions").update({ status: ok ? "done" : "failed", tx: tx ?? null, error: err ? err.slice(0, 300) : null }).eq("id", id);
}
/** Exécute une action réservée : si elle échoue, elle ne compte pas dans le plafond du jour. */
async function guarded<T extends { tx?: string | null }>(w: AgentWallet, kind: AgentKind, usd: number, summary: string, run: () => Promise<T>): Promise<T> {
  const id = await reserve(w, kind, usd, summary);
  try {
    const out = await run();
    await finish(id, true, out.tx ?? null);
    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    await finish(id, false, null, msg);
    if (e instanceof AgentWalletError || e instanceof TradeError || e instanceof ActionError) throw new AgentWalletError(e.message);
    console.error(`[agent-wallet] ${kind}:`, e);
    throw new AgentWalletError("The transaction failed");
  }
}

// ── Signature et envoi ───────────────────────────────────────────────────────

function signSolana(b64: string, kp: Keypair): Buffer {
  const raw = Buffer.from(b64, "base64");
  try {
    const v = VersionedTransaction.deserialize(raw);
    v.sign([kp]);
    return Buffer.from(v.serialize());
  } catch {
    const t = Transaction.from(raw);
    t.partialSign(kp);
    return t.serialize({ requireAllSignatures: false, verifySignatures: false });
  }
}

async function confirmSolana(conn: Connection, sig: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const s = (await conn.getSignatureStatuses([sig]).catch(() => null))?.value?.[0];
    if (s?.err) throw new AgentWalletError("The transaction failed on-chain");
    if (s?.confirmationStatus === "confirmed" || s?.confirmationStatus === "finalized") return;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new AgentWalletError("Transaction sent but not confirmed yet");
}

async function sendSolana(raw: Buffer): Promise<string> {
  const conn = solanaConnection();
  const sig = await conn.sendRawTransaction(raw, { maxRetries: 3 }).catch((e: unknown) => {
    throw new AgentWalletError(e instanceof Error ? (e.message.match(/Error Message: ([^."]+)/)?.[1] ?? "Transaction rejected (check the wallet balance)") : "Transaction rejected");
  });
  await confirmSolana(conn, sig);
  return sig;
}

const internal = (path: string, body: unknown) => new Request(`http://internal${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
async function json(res: Response): Promise<Record<string, unknown>> {
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new AgentWalletError(String(j.error ?? `Request failed (${res.status})`));
  return j;
}

// ── Actions de l'IA ──────────────────────────────────────────────────────────

/** Swap Terminal (n'importe quel token Solana contre SOL ou USDC), avec les frais OM habituels. */
export async function aiSwap(w: AgentWallet, p: { mint: string; side: "buy" | "sell"; amount: number; pay_with?: "SOL" | "USDC"; slippage_bps?: number }) {
  if (!Number.isFinite(p.amount) || p.amount <= 0) throw new AgentWalletError("amount must be positive");
  const quote = p.pay_with === "USDC" ? USDC_MINT : SOL_MINT;
  const conn = solanaConnection();
  let raw: bigint, usd = 0;
  if (p.side === "buy") {
    raw = BigInt(Math.floor(p.amount * (quote === SOL_MINT ? 1e9 : 1e6)));
    usd = quote === SOL_MINT ? await solToUsd(p.amount) : p.amount;
  } else {
    const dec = (await conn.getTokenSupply(new PublicKey(p.mint)).catch(() => { throw new AgentWalletError("Unknown token"); })).value.decimals;
    raw = BigInt(Math.floor(p.amount * 10 ** dec));
  }
  const inputMint = p.side === "buy" ? quote : p.mint, outputMint = p.side === "buy" ? p.mint : quote;
  return guarded(w, "swap", usd, `${p.side} ${p.amount} ${p.side === "buy" ? (quote === SOL_MINT ? "SOL" : "USDC") : "tokens"} of ${p.mint}`, async () => {
    const built = await runAsAgent(w.sol_address, async () => json(await swapTxRoute(internal("/api/swap/tx", { inputMint, outputMint, amount: raw.toString(), slippageBps: p.slippage_bps ?? 100 }))));
    const sig = await sendSolana(signSolana(String(built.tx), solKeypair(w.sol_secret)));
    await runAsAgent(w.sol_address, async () => swapRecordRoute(internal("/api/swap/record", { signature: sig, inputMint, outputMint }))).catch(() => {});
    return { tx: sig, explorer: `https://solscan.io/tx/${sig}`, out_estimate: built.outAmount ?? null };
  });
}

/** Swap EVM via 0x (Base, BNB, HyperEVM, Ethereum, Arbitrum, Polygon, Avalanche). Achat avec le natif de la chaîne, vente contre le natif. */
export async function aiSwapEvm(w: AgentWallet, p: { chain: string; token: string; side: "buy" | "sell"; amount: number; slippage_bps?: number }) {
  if (!isEvmChain(p.chain)) throw new AgentWalletError("Unsupported EVM network");
  if (!Number.isFinite(p.amount) || p.amount <= 0) throw new AgentWalletError("amount must be positive");
  const chain: EvmChain = p.chain;
  const pc = createPublicClient({ chain: evmChainDef(chain), transport: http(EVM_CHAINS[chain].rpc) });
  let decimals = 18, usd = 0;
  if (p.side === "buy") {
    const px = await nativeUsd(chain);
    if (!px) throw new AgentWalletError(`${EVM_CHAINS[chain].native} price unavailable right now, try again in a minute`);
    usd = Math.round(p.amount * px * 100) / 100;
  } else {
    decimals = Number(await pc.readContract({ address: p.token as Hex, abi: erc20Abi, functionName: "decimals" }).catch(() => { throw new AgentWalletError("Unknown token on this network"); }));
  }
  const raw = BigInt(Math.floor(p.amount * 10 ** (p.side === "buy" ? 18 : decimals)));
  const c = checkEvmInput({ chain, token: p.token, side: p.side, amount: raw.toString(), slippageBps: p.slippage_bps ?? 100 }, w.evm_address);
  if (!c.ok) throw new AgentWalletError(c.error);
  return guarded(w, "swap", usd, `${p.side} ${p.amount} ${p.side === "buy" ? EVM_CHAINS[chain].native : "tokens"} of ${p.token} on ${EVM_CHAINS[chain].name}`, async () => {
    let q;
    try { q = await zeroX(c.v, "quote"); } catch (e) { if (e instanceof EvmSwapError) throw new AgentWalletError(e.message); throw e; }
    if (!q.tx) throw new AgentWalletError("No route for this pair right now");
    if (q.balanceShort && p.side === "sell") throw new AgentWalletError("Not enough tokens in the wallet");
    const wc = createWalletClient({ account: evmAccount(w.evm_secret), chain: evmChainDef(chain), transport: http(EVM_CHAINS[chain].rpc) });
    if (p.side === "sell" && q.allowanceSpender) {
      const ah = await wc.sendTransaction({ to: p.token as Hex, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [q.allowanceSpender as Hex, raw] }), value: 0n });
      if ((await pc.waitForTransactionReceipt({ hash: ah, timeout: 90_000 })).status !== "success") throw new AgentWalletError("The token approval failed");
    }
    const hash = await wc.sendTransaction({ to: q.tx.to as Hex, data: q.tx.data as Hex, value: BigInt(q.tx.value || "0"), ...(q.tx.gas ? { gas: BigInt(q.tx.gas) } : {}) });
    if ((await pc.waitForTransactionReceipt({ hash, timeout: 90_000 })).status !== "success") throw new AgentWalletError("The swap failed on-chain");
    return { tx: hash, explorer: `${EVM_CHAINS[chain].explorer}/tx/${hash}`, out_estimate: q.buyAmount };
  });
}

/** Achat / vente d'un token OM sur sa bonding curve (Solana ou Arc). */
export async function aiTradeOm(w: AgentWallet, p: { token_id: string; side: "buy" | "sell"; amount: number; chain: "solana" | "arc"; slippage_bps?: number }) {
  if (!Number.isFinite(p.amount) || p.amount <= 0) throw new AgentWalletError("amount must be positive");
  const usd = p.side === "sell" ? 0 : p.chain === "arc" ? p.amount : await solToUsd(p.amount);
  return guarded(w, "trade", usd, `${p.side} ${p.amount} ${p.side === "sell" ? "tokens" : p.chain === "arc" ? "USDC" : "SOL"} of token ${p.token_id}`, async () => {
    if (p.chain === "solana") {
      const prep = (await prepareTrade({ wallet: w.sol_address, token_id: p.token_id, side: p.side, amount: p.amount, slippage_bps: p.slippage_bps })) as { tx_base64?: string };
      if (!prep.tx_base64) throw new AgentWalletError("This token trades on Arc: use chain arc");
      const signed = signSolana(prep.tx_base64, solKeypair(w.sol_secret));
      const { signature } = await submitTrade({ chain: "solana", signed_tx_base64: signed.toString("base64") }) as { signature: string };
      await confirmSolana(solanaConnection(), signature);
      return { tx: signature, explorer: `https://solscan.io/tx/${signature}` };
    }
    const prep = (await prepareTrade({ wallet: w.evm_address, token_id: p.token_id, side: p.side, amount: p.amount, slippage_bps: p.slippage_bps })) as { transactions?: { to: string; value: string; data: string }[] };
    if (!prep.transactions?.length) throw new AgentWalletError("This token trades on Solana: use chain solana");
    const account = evmAccount(w.evm_secret);
    const wc = createWalletClient({ account, chain: arc, transport: http(ARC_RPC) });
    const pc = createPublicClient({ chain: arc, transport: http(ARC_RPC) });
    let hash: Hex = "0x";
    for (const t of prep.transactions) {
      hash = await wc.sendTransaction({ to: t.to as Hex, value: BigInt(t.value), data: t.data as Hex });
      const rc = await pc.waitForTransactionReceipt({ hash, timeout: 60_000 });
      if (rc.status !== "success") throw new AgentWalletError("The transaction failed on Arc");
    }
    return { tx: hash, explorer: `https://explorer.arc.io/tx/${hash}` };
  });
}

/** Lancement d'un token Solana : l'IA en est la créatrice (elle touche les frais de créateur). */
export async function aiLaunch(w: AgentWallet, p: Record<string, unknown>, origin: string) {
  const firstBuy = Number(p.first_buy_sol ?? 0);
  if (!Number.isFinite(firstBuy) || firstBuy < 0) throw new AgentWalletError("Invalid first_buy_sol");
  const usd = await solToUsd(LAUNCH_COST_SOL + firstBuy);
  return guarded(w, "launch", usd, `launch $${String(p.ticker ?? "").slice(0, 10)}${firstBuy ? ` with a ${firstBuy} SOL first buy` : ""}`, async () => {
    const body: Record<string, unknown> = { wallet: w.sol_address };
    for (const k of ["name", "ticker", "description", "category", "logo_base64", "logo_mime", "website", "twitter", "telegram"]) if (p[k] !== undefined) body[k] = p[k];
    if (firstBuy > 0) body.first_buy_sol = firstBuy;
    const req = (path: string, b: unknown) => new Request(`${origin}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
    const prep = await json(await launchRoute(req("/api/v1/launch", body)));
    const id = String(prep.token_id);
    const kp = solKeypair(w.sol_secret);
    const params = { params: Promise.resolve({ id }) };
    let lastSig = "";
    for (const step of ["a", "b"] as const) {
      const tx = String(step === "a" ? prep.tx_a : prep.tx_b);
      if (!tx || tx === "null") throw new AgentWalletError("Launch transactions missing, try again");
      const signed = signSolana(tx, kp).toString("base64");
      const r = await json(await launchSubmitRoute(req(`/api/v1/launch/${id}/submit`, { wallet: w.sol_address, step, signed_tx_base64: signed }), params));
      lastSig = String(r.signature);
      await confirmSolana(solanaConnection(), lastSig);
    }
    const done = await json(await launchConfirmRoute(req(`/api/v1/launch/${id}/confirm`, { wallet: w.sol_address, tx_signature: lastSig }), params));
    return { tx: lastSig, token_id: id, mint: prep.mint ?? null, pool_address: done.pool_address ?? null, url: `${origin}/launchpad/${id}` };
  });
}

/** Mise USDC (Solana) sur un marché de prédiction (pool). Validée par l'admin comme toutes les mises. */
export async function aiBet(w: AgentWallet, p: { market_id: string; option_id: string; amount: number }) {
  if (!Number.isFinite(p.amount) || p.amount < 2) throw new AgentWalletError("Minimum bet is 2 USDC");
  const { data: m } = await db().from("mutuel_markets").select("id, title, options, status, bet_token, betting_closes_at").eq("id", p.market_id).maybeSingle();
  if (!m || m.status !== "active") throw new AgentWalletError("Market not found or not open");
  if ((m.bet_token ?? "usdc") !== "usdc") throw new AgentWalletError("Only USDC markets for AI wallets");
  if (m.betting_closes_at && new Date(m.betting_closes_at) < new Date()) throw new AgentWalletError("Betting is closed on this market");
  const opts = (typeof m.options === "string" ? JSON.parse(m.options) : m.options) as { id: string; label?: string }[];
  const opt = opts.find((o) => o.id === p.option_id);
  if (!opt) throw new AgentWalletError("option_id is not an option of this market");
  return guarded(w, "bet", p.amount, `bet ${p.amount} USDC on "${opt.label ?? p.option_id}" in ${String(m.title).slice(0, 80)}`, async () => {
    const payer = new PublicKey(w.sol_address), treasury = new PublicKey(TREASURY), mint = new PublicKey(USDC_MINT);
    const ref = `POOL-${Date.now().toString(36).toUpperCase()}-AI${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const memo = ["om?v=1", "kind=pool_prediction", `ref=${ref}`, `marketId=${p.market_id}`, `optionId=${p.option_id}`, "token=usdc", `wallet=${w.sol_address}`].join("&");
    const conn = solanaConnection();
    const { blockhash } = await conn.getLatestBlockhash("confirmed");
    const tx = new Transaction({ feePayer: payer, recentBlockhash: blockhash });
    tx.add(createAtaIdempotent(payer, treasury, mint));
    tx.add(new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [{ pubkey: payer, isSigner: true, isWritable: false }], data: Buffer.from(memo, "utf8") }));
    tx.add(refTransferIx(payer, treasury, USDC_MINT, BigInt(Math.round(p.amount * 1e6))));
    tx.sign(solKeypair(w.sol_secret));
    const sig = await sendSolana(tx.serialize());
    await runAsAgent(w.sol_address, async () => json(await predictRoute(internal("/api/pools/predict", {
      payment_request_id: `pool-req-ai-${Date.now().toString(36)}`, payment_reference: ref, title: m.title, subtitle: opt.label ?? p.option_id,
      market_id: p.market_id, selection_id: p.option_id, selection_label: opt.label ?? p.option_id, amount_usdc: p.amount, token: "usdc", tx_signature: sig, wallet_address: w.sol_address,
    }))));
    return { tx: sig, explorer: `https://solscan.io/tx/${sig}`, note: "Bet recorded. Like every bet it is validated by the OMdotfun team." };
  });
}

/** Création d'un marché de prédiction : l'IA paie les 0,5 USDC de frais avec son wallet, puis le marché part en validation. */
export async function aiCreateMarket(w: AgentWallet, p: Record<string, unknown>, ctx: { origin: string; ip: string }) {
  const title = String(p.title ?? "").slice(0, 200);
  if (title.length < 5) throw new AgentWalletError("title must be at least 5 characters");
  return guarded(w, "market", MARKET_FEE_USDC, `create market "${title.slice(0, 80)}"`, async () => {
    const prep = (await ACTIONS.pool_fee_prepare.run(w.sol_address, { title, fee_token: "usdc" }, ctx)) as { tx_base64: string };
    const signed = signSolana(prep.tx_base64, solKeypair(w.sol_secret)).toString("base64");
    const { signature } = (await ACTIONS.pool_fee_submit.run(w.sol_address, { signed_tx_base64: signed }, ctx)) as { signature: string };
    await confirmSolana(solanaConnection(), signature);
    const out = (await ACTIONS.create_pool_market.run(w.sol_address, { ...p, title, fee_token: "usdc", creation_tx: signature }, ctx)) as Record<string, unknown>;
    return { tx: signature, ...out };
  });
}

// ── Retrait (humain uniquement) : tout revient au wallet de l'humain ─────────

export async function withdrawAll(owner: string, id: string) {
  const w = await walletOfOwner(owner, id);
  const out: { chain: string; tx: string }[] = [];
  const log = async (summary: string, tx: string | null, err?: string) => {
    await db().from("agent_wallet_actions").insert({ wallet_id: w.id, kind: "withdraw", amount_usd: 0, status: err ? "failed" : "done", summary, tx, error: err ?? null });
  };
  if (!owner.startsWith("0x")) {
    const conn = solanaConnection();
    const from = new PublicKey(w.sol_address), to = new PublicKey(owner), mint = new PublicKey(USDC_MINT);
    const usdc = await conn.getTokenAccountBalance(ataOf(from, mint)).then((r) => BigInt(r.value.amount)).catch(() => 0n);
    const lamports = BigInt(await conn.getBalance(from));
    const { blockhash } = await conn.getLatestBlockhash("confirmed");
    const tx = new Transaction({ feePayer: from, recentBlockhash: blockhash });
    if (usdc > 0n) { tx.add(createAtaIdempotent(from, to, mint)); tx.add(refTransferIx(from, to, USDC_MINT, usdc)); }
    // On garde de quoi payer les frais et la création éventuelle du compte USDC de l'humain
    const keep = 10_000n + (usdc > 0n ? 2_100_000n : 0n);
    if (lamports > keep) tx.add(SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports: lamports - keep }));
    if (tx.instructions.length) {
      tx.sign(solKeypair(w.sol_secret));
      try { const sig = await sendSolana(tx.serialize()); out.push({ chain: "solana", tx: sig }); await log("withdraw SOL and USDC to the owner", sig); }
      catch (e) { await log("withdraw on Solana", null, (e as Error).message); throw e; }
    }
  } else {
    const account = evmAccount(w.evm_secret);
    const nets: { key: string; chain: ReturnType<typeof defineChain>; rpc: string }[] = [
      { key: "arc", chain: arc as unknown as ReturnType<typeof defineChain>, rpc: ARC_RPC },
      ...(Object.keys(EVM_CHAINS) as EvmChain[]).map((c) => ({ key: c, chain: evmChainDef(c), rpc: EVM_CHAINS[c].rpc })),
    ];
    for (const n of nets) {
      try {
        const pc = createPublicClient({ chain: n.chain, transport: http(n.rpc) });
        const bal = await pc.getBalance({ address: account.address });
        const gasPrice = await pc.getGasPrice();
        const fee = gasPrice * 21_000n * 2n;
        if (bal <= fee) continue;
        const wc = createWalletClient({ account, chain: n.chain, transport: http(n.rpc) }) as any;
        const hash = await wc.sendTransaction({ to: owner as Hex, value: bal - fee, gas: 21_000n, gasPrice });
        out.push({ chain: n.key, tx: hash }); await log(`withdraw native funds on ${n.key} to the owner`, hash);
      } catch (e) { await log(`withdraw on ${n.key}`, null, (e as Error).message.slice(0, 200)); }
    }
  }
  if (!out.length) throw new AgentWalletError("Nothing to withdraw");
  return out;
}
