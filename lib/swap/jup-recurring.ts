/**
 * Serveur : ordres TWAP (achat ou vente découpé dans le temps) via l'API Recurring de Jupiter.
 * Jupiter garde l'ordre et exécute chaque part à son heure, même si l'utilisateur n'est plus sur OM.
 * Minimum imposé par Jupiter : 100 $ au total, au moins 2 parts, 50 $ par part.
 * Frais OM : 0,3 % en SOL, ajoutés dans la même transaction (comme les ordres limités).
 */
import { SOL_MINT } from "@/lib/swap/core";
import { bestPair, decimals, LIMIT_FEE_BPS, TriggerError, withFee } from "@/lib/swap/jup-trigger";

const BASE = process.env.JUP_API_KEY ? "https://api.jup.ag/recurring/v1" : "https://lite-api.jup.ag/recurring/v1";
const headers = (): Record<string, string> => ({ "Content-Type": "application/json", ...(process.env.JUP_API_KEY ? { "x-api-key": process.env.JUP_API_KEY } : {}) });

/** Limites de Jupiter (en dollars) */
export const TWAP_MIN_TOTAL_USD = 100;
export const TWAP_MIN_PART_USD = 50;
/** Intervalles proposés (secondes) */
export const TWAP_INTERVALS = [60, 300, 900, 3600, 4 * 3600, 86_400] as const;

async function jup<T>(path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try { r = await fetch(`${BASE}${path}`, { ...init, headers: headers(), signal: AbortSignal.timeout(12_000), cache: "no-store" }); }
  catch { throw new TriggerError("TWAP service unreachable, try again", 503); }
  const j = (await r.json().catch(() => ({}))) as T & { error?: string; message?: string; cause?: string };
  if (!r.ok || (j as { error?: string }).error) {
    const msg = String(j.error ?? j.message ?? j.cause ?? "");
    if (/minimum|too small|100 ?usd|50 ?usd/i.test(msg)) throw new TriggerError("Minimum is $100 in total and $50 per part");
    if (r.status === 429) throw new TriggerError("Too many requests, try again in a few seconds", 429);
    throw new TriggerError(msg ? msg.slice(0, 120) : "Could not create the TWAP order");
  }
  return j;
}

const raw = (ui: number, dec: number) => BigInt(Math.floor(ui * 10 ** Math.min(dec, 9))) * 10n ** BigInt(Math.max(0, dec - 9));

/**
 * Prépare un TWAP. side=buy : `amount` SOL dépensés en `parts` achats, un toutes les `interval` secondes.
 * side=sell : `amount` tokens vendus en `parts` ventes.
 */
export async function createTwap(maker: string, b: { side: "buy" | "sell"; mint: string; amount: number; parts: number; interval: number }) {
  if (!Number.isInteger(b.parts) || b.parts < 2 || b.parts > 100) throw new TriggerError("Choose between 2 and 100 parts");
  if (!(TWAP_INTERVALS as readonly number[]).includes(b.interval)) throw new TriggerError("Invalid interval");
  const [tok, sol, dec] = await Promise.all([bestPair(b.mint), bestPair(SOL_MINT), b.side === "sell" ? decimals(b.mint) : Promise.resolve(9)]);
  if (!sol || (b.side === "sell" && !tok)) throw new TriggerError("Price not available for this token");
  // Valeur en dollars : on vérifie les minimums de Jupiter avant de lui envoyer l'ordre
  const usd = b.side === "buy" ? b.amount * sol.price : b.amount * (tok?.price ?? 0);
  if (usd < TWAP_MIN_TOTAL_USD) throw new TriggerError("Minimum is $100 in total and $50 per part");
  if (usd / b.parts < TWAP_MIN_PART_USD) throw new TriggerError("Each part must be at least $50: use fewer parts");
  const inAmount = b.side === "buy" ? raw(b.amount, 9) : raw(b.amount, dec);
  if (inAmount <= 0n) throw new TriggerError("Amount too small");
  const res = await jup<{ requestId: string; transaction: string }>("/createOrder", {
    method: "POST",
    body: JSON.stringify({
      user: maker,
      inputMint: b.side === "buy" ? SOL_MINT : b.mint,
      outputMint: b.side === "buy" ? b.mint : SOL_MINT,
      params: { time: { inAmount: Number(inAmount), numberOfOrders: b.parts, interval: b.interval, minPrice: null, maxPrice: null, startAt: null } },
    }),
  });
  // Frais OM : 0,3 % de la valeur en SOL (achat : SOL dépensés ; vente : valeur estimée en SOL)
  const solValue = b.side === "buy" ? inAmount : raw((b.amount * (tok?.price ?? 0)) / sol.price, 9);
  const fee = await withFee(res.transaction, maker, (solValue * BigInt(LIMIT_FEE_BPS)) / 10_000n);
  return { ...res, transaction: fee.tx, feeLamports: fee.fee.toString(), direct: fee.fee > 0n, usd };
}

export const executeTwap = (signedTransaction: string, requestId: string) =>
  jup<{ signature: string; status: string }>("/execute", { method: "POST", body: JSON.stringify({ signedTransaction, requestId }) });

export const cancelTwap = (user: string, order: string) =>
  jup<{ transaction: string; requestId: string }>("/cancelOrder", { method: "POST", body: JSON.stringify({ order, user, recurringType: "time" }) });

export type TwapOrder = {
  orderKey: string; inputMint: string; outputMint: string; inDeposited?: string; inUsed?: string; inAmountPerCycle?: string;
  cycleFrequency?: string; createdAt: string; trades?: unknown[];
};
export async function activeTwaps(user: string): Promise<TwapOrder[]> {
  const j = await jup<{ time?: TwapOrder[]; all?: TwapOrder[] }>(`/getRecurringOrders?user=${user}&orderStatus=active&recurringType=time&includeFailedTx=false`);
  return j.time ?? j.all ?? [];
}
