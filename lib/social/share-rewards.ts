/**
 * Récompenses de partage d'un marché dans le fil.
 *  - recordAttribution : un pari envoyé depuis un post est attribué à son auteur (premier post gagnant, pas soi-même).
 *  - awardShareOmero   : marchés de prédiction (créés par les admins) → 200 OMERO à l'auteur, une fois par parieur et par marché,
 *                        au moment où l'admin valide le pari.
 *  - distributePoolShare : pools → 20 % de la commission de la plateforme, répartis selon les mises venues de chaque post.
 * Ne lève jamais d'erreur : un échec ne doit pas bloquer un pari ou une résolution.
 */
import { createAdminClient } from "@/lib/supabase/server";
import { awardOcto } from "@/lib/octo";
import { isBanned } from "@/lib/moderation";

export const SHARE_OMERO = 200;
export const POOL_SHARE_OF_COMMISSION = 0.2;
const MAX_OMERO_REWARDS_PER_DAY = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const norm = (w: string) => (/^0x[0-9a-fA-F]{40}$/.test(w) ? w.toLowerCase() : w);

export async function recordAttribution(postId: unknown, bettorRaw: string, kind: "pool" | "prediction", marketId: string): Promise<void> {
  try {
    if (typeof postId !== "string" || !UUID.test(postId) || !UUID.test(marketId)) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data: post } = await admin.from("posts").select("id, author, market_kind, market_id, hidden").eq("id", postId).maybeSingle();
    if (!post || post.hidden || post.market_kind !== kind || post.market_id !== marketId) return;
    const bettor = norm(bettorRaw);
    if (post.author === bettor) return;
    await admin.from("share_attributions").upsert(
      { market_kind: kind, market_id: marketId, bettor, post_id: postId, sharer: post.author },
      { onConflict: "market_kind,market_id,bettor", ignoreDuplicates: true },
    );
  } catch (e) { console.error("[share] attribution:", e); }
}

export async function awardShareOmero(marketId: string, bettorRaw: string): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const bettor = norm(bettorRaw);
    const { data: a } = await admin.from("share_attributions").select("sharer, omero_paid").eq("market_kind", "prediction").eq("market_id", marketId).eq("bettor", bettor).maybeSingle();
    if (!a || a.omero_paid || (await isBanned(a.sharer)) || (await isBanned(bettor))) return;
    // Plafond quotidien par partageur (anti-abus)
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await admin.from("share_rewards").select("id", { count: "exact", head: true }).eq("sharer", a.sharer).gt("omero", 0).gte("created_at", since);
    if ((count ?? 0) >= MAX_OMERO_REWARDS_PER_DAY) return;
    // Verrou : ne payer qu'une fois
    const { data: lock } = await admin.from("share_attributions").update({ omero_paid: true }).eq("market_kind", "prediction").eq("market_id", marketId).eq("bettor", bettor).eq("omero_paid", false).select("sharer");
    if (!lock?.length) return;
    await awardOcto(a.sharer, SHARE_OMERO, "referral", "Market shared on the feed");
    await admin.from("share_rewards").insert({ sharer: a.sharer, market_kind: "prediction", market_id: marketId, omero: SHARE_OMERO });
  } catch (e) { console.error("[share] omero:", e); }
}

/**
 * Pools : partage 20 % de la commission de la plateforme entre les auteurs des posts,
 * au prorata des mises (toutes options confondues) des parieurs venus de leurs posts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function distributePoolShare(sb: any, marketId: string, bets: { wallet_address: string; amount: number }[], commission: number, isClt: boolean): Promise<void> {
  try {
    if (!(commission > 0) || bets.length === 0) return;
    const { data: attrs } = await sb.from("share_attributions").select("bettor, sharer").eq("market_kind", "pool").eq("market_id", marketId);
    if (!attrs?.length) return;
    const sharerOf = new Map<string, string>((attrs as { bettor: string; sharer: string }[]).map((x) => [x.bettor, x.sharer]));
    const { data: bn } = await sb.from("banned_wallets").select("wallet").in("wallet", [...new Set([...sharerOf.values(), ...bets.map((b) => norm(b.wallet_address))])]);
    const bannedSet = new Set<string>(((bn ?? []) as { wallet: string }[]).map((x) => x.wallet));
    const weight = new Map<string, number>();
    let total = 0;
    for (const b of bets) {
      const s = sharerOf.get(norm(b.wallet_address));
      if (!s || s === norm(b.wallet_address) || bannedSet.has(s) || bannedSet.has(norm(b.wallet_address))) continue;
      const amt = Number(b.amount) || 0;
      weight.set(s, (weight.get(s) ?? 0) + amt);
      total += amt;
    }
    if (total <= 0) return;
    const pot = commission * POOL_SHARE_OF_COMMISSION;
    const round = (n: number) => (isClt ? Math.floor(n) : Math.round(n * 1_000_000) / 1_000_000);
    const commissions = [];
    const rewards = [];
    for (const [sharer, w] of weight) {
      const amount = round((pot * w) / total);
      if (amount <= 0) continue;
      // Versé comme une commission : apparaît dans le solde et se retire comme les gains de parrainage
      commissions.push({ referrer_wallet: sharer, referred_wallet: `share:${marketId}`, amount_usdc: isClt ? 0 : amount, amount_clt: isClt ? amount : 0 });
      rewards.push({ sharer, market_kind: "pool", market_id: marketId, amount_usdc: isClt ? 0 : amount, amount_clt: isClt ? amount : 0 });
    }
    if (commissions.length) {
      const { error } = await sb.from("referral_commissions").insert(commissions);
      if (error) { console.error("[share] pool commissions:", error.message); return; }
      await sb.from("share_rewards").insert(rewards);
    }
  } catch (e) { console.error("[share] pool:", e); }
}
