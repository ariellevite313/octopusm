/**
 * Gains sur les achats de tokens, payés sur ce que la plateforme gagne (jamais plus que ses frais) :
 *  - parrain : 10 % des frais de la plateforme sur les achats de ses filleuls
 *  - post    : 1 % des frais de la plateforme sur les achats faits depuis un post (bouton Trade)
 * Tous les taux sont ici, à un seul endroit.
 *
 * Anti-triche :
 *  - seuls des trades confirmés sur la chaîne comptent (événement Arc / transaction Solana relue par le serveur) ;
 *  - un trade ne paie qu'une fois par type (clé unique + fonction SQL atomique) ;
 *  - jamais pour soi-même ; le trader d'un post est celui qui a ouvert le post avec son propre compte ;
 *  - l'attribution doit exister AVANT le trade, dure 7 jours, premier post gagnant ;
 *  - le gain est toujours plus petit que les frais payés par le trader : faire tourner de faux trades coûte plus qu'il ne rapporte.
 */
import { createAdminClient } from "@/lib/supabase/server";
import { isBanned } from "@/lib/moderation";

export const REFERRER_SHARE_OF_FEE = 0.1;
export const POST_SHARE_OF_FEE = 0.01;
/**
 * Part du volume que la plateforme encaisse réellement.
 *  - Arc    : lu sur la courbe du token (platformBps de son niveau : 0,25 / 0,30 / 0,40 / 0,50 %). 0,25 % (Standard, le plus bas) si la lecture échoue.
 *  - Solana : 0,5 % pour les deux niveaux : frais 1,25 % → 20 % Meteora, reste 50/50 = 0,5 % ; frais 2 % → 0,8 % (donc 0,5 % reste prudent).
 */
export const PLATFORM_FEE_RATE = { arc: 0.0025, solana: 0.005 } as const;
export const MIN_VOLUME_USD = 1;
export const ATTRIBUTION_DAYS = 7;

export type Chain = keyof typeof PLATFORM_FEE_RATE;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const normWallet = (w: string) => (/^0x[0-9a-fA-F]{40}$/.test(w) ? w.toLowerCase() : w);
const round6 = (n: number) => Math.floor(n * 1_000_000) / 1_000_000;

/** Calcul pur des montants (en USDC) pour un achat. */
export function computeTradeRewards(chain: Chain, volumeUsd: number, opts: { hasReferrer: boolean; hasPost: boolean }, feeRate?: number) {
  if (!Number.isFinite(volumeUsd) || volumeUsd < MIN_VOLUME_USD) return { fee: 0, referral: 0, post: 0 };
  // Taux réel du token si connu (jamais au-dessus de 1 % du volume), sinon le taux prudent de la chaîne
  const rate = feeRate !== undefined && Number.isFinite(feeRate) && feeRate > 0 && feeRate <= 0.01 ? feeRate : PLATFORM_FEE_RATE[chain];
  const fee = volumeUsd * rate;
  return {
    fee,
    referral: opts.hasReferrer ? round6(fee * REFERRER_SHARE_OF_FEE) : 0,
    post: opts.hasPost ? round6(fee * POST_SHARE_OF_FEE) : 0,
  };
}

/** Enregistre de quel post vient un trader pour un token (premier post gagnant, 7 jours, pas soi-même). */
export async function registerTradeAttribution(db: Db, postId: unknown, traderRaw: string): Promise<boolean> {
  try {
    if (typeof postId !== "string" || !UUID.test(postId)) return false;
    const trader = normWallet(traderRaw);
    const { data: post } = await db.from("posts").select("id, author, token_id, hidden").eq("id", postId).maybeSingle();
    if (!post || post.hidden || !post.token_id || normWallet(post.author) === trader) return false;
    const { data: cur } = await db.from("trade_attributions").select("created_at").eq("token_id", post.token_id).eq("trader", trader).maybeSingle();
    if (cur) {
      if (Date.now() - new Date(cur.created_at).getTime() < ATTRIBUTION_DAYS * 86_400_000) return false; // premier post gagnant
      await db.from("trade_attributions").delete().eq("token_id", post.token_id).eq("trader", trader);
    }
    const { error } = await db.from("trade_attributions").insert({ token_id: post.token_id, trader, post_id: postId, sharer: post.author });
    return !error;
  } catch (e) { console.error("[trade-rewards] attribution:", e); return false; }
}

export type Buy = { chain: Chain; tokenId: string; txId: string; trader: string; volumeUsd: number; tsMs: number; feeRate?: number };

/** Verse les gains d'un achat vérifié. Idempotent. Ne lève jamais d'erreur. Retourne les montants versés. */
export async function awardTradeRewards(db: Db, buy: Buy): Promise<{ referral: number; post: number }> {
  const out = { referral: 0, post: 0 };
  try {
    const trader = normWallet(buy.trader);
    const [{ data: ref }, { data: att }] = await Promise.all([
      db.from("referrals").select("referrer_wallet").ilike("referred_wallet", trader).maybeSingle(),
      db.from("trade_attributions").select("sharer, created_at").eq("token_id", buy.tokenId).eq("trader", trader).maybeSingle(),
    ]);
    const referrer: string | null = ref?.referrer_wallet && normWallet(ref.referrer_wallet) !== trader ? ref.referrer_wallet : null;
    const attAt = att ? new Date(att.created_at).getTime() : 0;
    const postOk = !!att && att.sharer !== trader && buy.tsMs >= attAt && buy.tsMs - attAt <= ATTRIBUTION_DAYS * 86_400_000;
    const r = computeTradeRewards(buy.chain, buy.volumeUsd, { hasReferrer: !!referrer, hasPost: postOk }, buy.feeRate);
    const pay = async (kind: "referral" | "post", who: string, amount: number) => {
      if (amount <= 0) return 0;
      if (await isBanned(who) || await isBanned(trader)) return 0; // comptes bannis : pas de gains
      const { data, error } = await db.rpc("award_trade_reward", {
        p_kind: kind, p_tx: buy.txId, p_beneficiary: who, p_trader: trader, p_token: buy.tokenId,
        p_chain: buy.chain, p_volume: buy.volumeUsd, p_fee: r.fee, p_amount: amount,
      });
      if (error) { console.error("[trade-rewards] rpc:", error.message); return 0; }
      return data === true ? amount : 0;
    };
    if (referrer) out.referral = await pay("referral", referrer, r.referral);
    if (postOk && att) out.post = await pay("post", att.sharer, r.post);
  } catch (e) { console.error("[trade-rewards] award:", e); }
  return out;
}

const arcRateCache = new Map<string, number>();
/** Part de la plateforme (platformBps du niveau du token) lue sur la courbe Arc ; null si illisible. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function arcPlatformRate(pc: any, curve: string): Promise<number | null> {
  const k = curve.toLowerCase();
  const hit = arcRateCache.get(k);
  if (hit !== undefined) return hit;
  try {
    const { BONDING_CURVE_V2_ABI } = await import("@/lib/arc-launchpad");
    const r = (await pc.readContract({ address: curve as `0x${string}`, abi: BONDING_CURVE_V2_ABI, functionName: "tierBps" })) as readonly bigint[];
    const total = Number(r[0]), platform = Number(r[2]);
    if (!(platform > 0) || platform > total || total > 500) return null; // valeur incohérente : on garde le taux prudent
    const rate = platform / 10_000;
    arcRateCache.set(k, rate);
    return rate;
  } catch { return null; }
}

/** Arc : repère dans les trades déjà lus (arc_trades) les achats récents qui donnent droit à un gain. */
export async function processArcRewards(db: Db = createAdminClient(), sinceHours = 72): Promise<number> {
  let paid = 0;
  try {
    const since = Math.floor(Date.now() / 1000) - sinceHours * 3600;
    const { data: toks } = await db.from("launchpad_tokens").select("id, arc_launch_id").eq("chain", "arc").not("arc_launch_id", "is", null);
    const byCurve = new Map<string, string>((toks ?? []).map((t: { id: string; arc_launch_id: string }) => [t.arc_launch_id.toLowerCase(), t.id]));
    const { data: buys } = await db.from("arc_trades").select("curve, tx_hash, log_index, block, ts, trader, usdc_amt")
      .eq("is_buy", true).gte("ts", since).order("ts", { ascending: false }).limit(3000);
    const rows = ((buys ?? []) as { curve: string; tx_hash: string; log_index: number; block: number; ts: number; trader: string; usdc_amt: number }[])
      .filter((b) => byCurve.has(b.curve.toLowerCase()) && b.usdc_amt >= MIN_VOLUME_USD);
    if (!rows.length) return 0;

    const { createPublicClient, http } = await import("viem");
    const { arc } = await import("@/lib/arc-chain");
    const pc = createPublicClient({ chain: arc, transport: http("https://rpc.mainnet.arc.io", { timeout: 15_000, retryCount: 2 }) });
    const traders = [...new Set(rows.map((b) => b.trader))];
    const [{ data: atts }, refs] = await Promise.all([
      db.from("trade_attributions").select("trader, token_id, created_at").in("trader", traders),
      Promise.all(traders.map(async (t) => {
        const { data } = await db.from("referrals").select("referred_wallet").ilike("referred_wallet", t).maybeSingle();
        return data ? t : null;
      })),
    ]);
    const referred = new Set(refs.filter(Boolean) as string[]);
    const attKey = new Set(((atts ?? []) as { trader: string; token_id: string }[]).map((a) => `${a.trader}|${a.token_id}`));

    for (const b of rows) {
      const tokenId = byCurve.get(b.curve.toLowerCase())!;
      if (!referred.has(b.trader) && !attKey.has(`${b.trader}|${tokenId}`)) continue;
      // Les horodatages de arc_trades sont interpolés : pour une attribution par post on lit l'heure exacte du bloc.
      let tsMs = b.ts * 1000;
      if (attKey.has(`${b.trader}|${tokenId}`)) {
        try {
          tsMs = Number((await pc.getBlock({ blockNumber: BigInt(b.block) })).timestamp) * 1000;
        } catch { continue; } // pas d'heure exacte : on réessaiera au prochain passage
      }
      const feeRate = (await arcPlatformRate(pc, b.curve)) ?? undefined;
      const r = await awardTradeRewards(db, { chain: "arc", tokenId, txId: `${b.tx_hash}:${b.log_index}`, trader: b.trader, volumeUsd: b.usdc_amt, tsMs, feeRate });
      paid += r.referral + r.post;
    }
  } catch (e) { console.error("[trade-rewards] arc:", e); }
  return paid;
}
