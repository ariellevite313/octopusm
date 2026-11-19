/**
 * Serveur : ordres limités via l'API Trigger de Jupiter. Jupiter garde l'ordre et l'exécute quand le prix est atteint :
 * OM n'a rien à surveiller. On fixe le prix par une capitalisation cible (comme les alertes).
 */
import { SOL_MINT, SWAP_FEE_BPS, SWAP_FEE_WALLET } from "@/lib/swap/core";
import { solanaConnection } from "@/lib/solana/rpc";
import { AddressLookupTableAccount, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";

const BASE = process.env.JUP_API_KEY ? "https://api.jup.ag/trigger/v1" : "https://lite-api.jup.ag/trigger/v1";
const headers = (): Record<string, string> => ({ "Content-Type": "application/json", ...(process.env.JUP_API_KEY ? { "x-api-key": process.env.JUP_API_KEY } : {}) });

/** Frais OM sur un ordre limité : 0,3 %, en SOL, pris dans la même transaction (sans compte de parrainage Jupiter). */
export const LIMIT_FEE_BPS = SWAP_FEE_BPS;

/**
 * Ajoute à la transaction de Jupiter un virement des frais OM (SOL) du maker vers la plateforme.
 * Renvoie la transaction d'origine si elle ne peut pas être modifiée sans risque (autre signataire que le maker).
 */
export async function withFee(txB64: string, maker: string, lamports: bigint): Promise<{ tx: string; fee: bigint }> {
  if (lamports <= 0n) return { tx: txB64, fee: 0n };
  try {
    const vtx = VersionedTransaction.deserialize(Buffer.from(txB64, "base64"));
    const need = vtx.message.header.numRequiredSignatures;
    const keys = vtx.message.staticAccountKeys;
    const makerPk = new PublicKey(maker);
    // Une signature déjà posée par un autre que le maker serait invalidée par la modification
    for (let i = 0; i < need; i++) {
      if (keys[i].equals(makerPk)) continue;
      if (vtx.signatures[i]?.some((b) => b !== 0)) return { tx: txB64, fee: 0n };
    }
    const conn = solanaConnection();
    const luts = (await Promise.all(vtx.message.addressTableLookups.map((l) => conn.getAddressLookupTable(l.accountKey).then((r) => r.value)))).filter((x): x is AddressLookupTableAccount => !!x);
    if (luts.length !== vtx.message.addressTableLookups.length) return { tx: txB64, fee: 0n };
    const msg = TransactionMessage.decompile(vtx.message, { addressLookupTableAccounts: luts });
    msg.instructions.push(SystemProgram.transfer({ fromPubkey: makerPk, toPubkey: new PublicKey(SWAP_FEE_WALLET), lamports }));
    const out = new VersionedTransaction(msg.compileToV0Message(luts));
    return { tx: Buffer.from(out.serialize()).toString("base64"), fee: lamports };
  } catch { return { tx: txB64, fee: 0n }; }
}

export class TriggerError extends Error { constructor(msg: string, public status = 400) { super(msg); } }

async function jup<T>(path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try { r = await fetch(`${BASE}${path}`, { ...init, headers: headers(), signal: AbortSignal.timeout(12_000), cache: "no-store" }); }
  catch { throw new TriggerError("Limit order service unreachable, try again", 503); }
  const j = (await r.json().catch(() => ({}))) as T & { error?: string; cause?: string; message?: string };
  if (!r.ok || (j as { error?: string }).error) {
    const msg = String(j.error ?? j.message ?? j.cause ?? "");
    if (/minimum|too small|5 ?usd/i.test(msg)) throw new TriggerError("Minimum order is about $5");
    if (r.status === 429) throw new TriggerError("Too many requests, try again in a few seconds", 429);
    throw new TriggerError(msg ? msg.slice(0, 120) : "Could not create the order");
  }
  return j;
}

type Ds = { baseToken?: { address?: string }; priceUsd?: string; marketCap?: number; fdv?: number; liquidity?: { usd?: number } };
export async function bestPair(mint: string): Promise<{ price: number; mcap: number | null } | null> {
  try {
    const r = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${mint}`, { signal: AbortSignal.timeout(8000), next: { revalidate: 15 } });
    const pairs = ((r.ok ? await r.json() : []) as Ds[]).filter((p) => p.baseToken?.address === mint).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    const p = pairs[0];
    return p && Number(p.priceUsd) > 0 ? { price: Number(p.priceUsd), mcap: p.marketCap ?? p.fdv ?? null } : null;
  } catch { return null; }
}

export async function decimals(mint: string): Promise<number> {
  const s = await solanaConnection().getTokenSupply(new PublicKey(mint)).catch(() => null);
  if (!s) throw new TriggerError("Token not found");
  return s.value.decimals;
}

const raw = (ui: number, dec: number) => BigInt(Math.floor(ui * 10 ** Math.min(dec, 9))) * 10n ** BigInt(Math.max(0, dec - 9));

/**
 * Prépare un ordre. side=buy : `amount` SOL dépensés quand le token descend à `targetMcap`.
 * side=sell : `amount` tokens vendus quand il monte à `targetMcap` (prise de profit).
 */
export async function createLimitOrder(maker: string, b: { side: "buy" | "sell"; mint: string; amount: number; targetMcap: number }) {
  const [tok, sol, dec] = await Promise.all([bestPair(b.mint), bestPair(SOL_MINT), decimals(b.mint)]);
  if (!tok?.mcap || !sol) throw new TriggerError("Price not available for this token");
  const target = tok.price * (b.targetMcap / tok.mcap);
  if (!(target > 0)) throw new TriggerError("Invalid target");
  // Ordre limité : acheter sous le prix actuel, vendre au-dessus (sinon il s'exécuterait tout de suite)
  if (b.side === "buy" ? b.targetMcap >= tok.mcap : b.targetMcap <= tok.mcap) {
    throw new TriggerError(b.side === "buy" ? "For a limit buy, the target must be below the current market cap." : "For a limit sell, the target must be above the current market cap.");
  }
  const making = b.side === "buy" ? raw(b.amount, 9) : raw(b.amount, dec);
  const taking = b.side === "buy" ? raw((b.amount * sol.price) / target, dec) : raw((b.amount * target) / sol.price, 9);
  if (making <= 0n || taking <= 0n) throw new TriggerError("Amount too small");
  const res = await jup<{ order: string; transaction: string; requestId: string }>("/createOrder", {
    method: "POST",
    body: JSON.stringify({
      inputMint: b.side === "buy" ? SOL_MINT : b.mint, outputMint: b.side === "buy" ? b.mint : SOL_MINT,
      maker, payer: maker, params: { makingAmount: making.toString(), takingAmount: taking.toString() },
      computeUnitPrice: "auto", wrapAndUnwrapSol: true,
    }),
  });
  // Frais OM : 0,3 % du montant en SOL (achat : SOL dépensés ; vente : SOL attendus). Un virement de plus dans la même transaction.
  const solSide = b.side === "buy" ? making : taking;
  const fee = await withFee(res.transaction, maker, (solSide * BigInt(LIMIT_FEE_BPS)) / 10_000n);
  return { ...res, transaction: fee.tx, feeLamports: fee.fee.toString(), direct: fee.fee > 0n, targetPrice: target, amountSol: b.side === "buy" ? b.amount : Number(taking) / 1e9 };
}

/** Envoie une transaction d'ordre déjà signée par le maker (celle qui contient les frais OM, que Jupiter n'a pas construite telle quelle). */
export async function sendSigned(signedTransaction: string): Promise<{ signature: string; status: string }> {
  const conn = solanaConnection();
  const raw = Buffer.from(signedTransaction, "base64");
  const signature = await conn.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 3 }).catch((e: Error) => {
    if (/insufficient/i.test(e.message)) throw new TriggerError("Insufficient SOL balance for this order");
    throw new TriggerError("Could not place the order, try again");
  });
  const done = await conn.confirmTransaction(signature, "confirmed").catch(() => null);
  if (done?.value?.err) throw new TriggerError("Could not place the order, try again");
  return { signature, status: "Success" };
}

export const executeOrder = (signedTransaction: string, requestId: string) =>
  jup<{ signature: string; status: string }>("/execute", { method: "POST", body: JSON.stringify({ signedTransaction, requestId }) });

export const cancelOrder = (maker: string, order: string) =>
  jup<{ transaction: string; requestId: string }>("/cancelOrder", { method: "POST", body: JSON.stringify({ maker, order, computeUnitPrice: "auto" }) });

export type TriggerOrder = { orderKey: string; inputMint: string; outputMint: string; makingAmount: string; takingAmount: string; remainingMakingAmount?: string; createdAt: string; status?: string };
export async function activeOrders(user: string): Promise<TriggerOrder[]> {
  const j = await jup<{ orders?: TriggerOrder[] }>(`/getTriggerOrders?user=${user}&orderStatus=active`);
  return j.orders ?? [];
}
