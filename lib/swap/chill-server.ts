/** Serveur : détenteur lié à un swap « Chill ton sac » (contrôles sur la chaîne). */
import { PublicKey } from "@solana/web3.js";
import { solanaConnection } from "@/lib/solana/rpc";
import { createAdminClient } from "@/lib/supabase/server";
import { jupTokens } from "@/lib/bags";
import { SOL_MINT, USDC_MINT, ataOf, feeMintFor, tradedMint } from "./core";
import { CHILL_MIN_USD, RENT_EXEMPT_MIN } from "./chill";

/** Valeur en $ détenue par `wallet` pour `mint` (solde sur la chaîne × prix Jupiter / DexScreener). */
export async function holdingUsd(wallet: string, mint: string): Promise<{ amount: number; usd: number | null; price: number | null }> {
  const accs = await solanaConnection().getParsedTokenAccountsByOwner(new PublicKey(wallet), { mint: new PublicKey(mint) }).catch(() => ({ value: [] }));
  let amount = 0;
  for (const a of accs.value) amount += Number((a.account.data as { parsed?: { info?: { tokenAmount?: { uiAmountString?: string } } } }).parsed?.info?.tokenAmount?.uiAmountString ?? 0);
  let price = (await jupTokens([mint])).get(mint)?.usdPrice ?? null;
  if (price == null) {
    // Token OM encore sur la bonding curve : prix de notre base
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { data } = await db.from("launchpad_tokens").select("price_usd").eq("mint_address", mint).limit(1).maybeSingle();
    price = data?.price_usd != null && Number(data.price_usd) > 0 ? Number(data.price_usd) : null;
  }
  return { amount, price, usd: price != null ? amount * price : null };
}

const cache = new Map<string, { at: number; v: { wallet: string; postId: string } | null }>();

/**
 * Détenteur à payer pour ce swap, ou null : le post doit être un sac sur ce token, l'auteur n'est pas l'acheteur,
 * il détient encore au moins 1 $ du token, et son compte peut recevoir la part (SOL ou USDC).
 */
export async function resolveRef(postId: unknown, taker: string, inputMint: string, outputMint: string): Promise<{ wallet: string; postId: string } | null> {
  if (typeof postId !== "string" || !/^[0-9a-f-]{36}$/i.test(postId)) return null;
  const key = `${postId}:${taker}:${inputMint}:${outputMint}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.v;
  const v = await (async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { data: post } = await db.from("posts").select("id, author, kind, bag_mint, hidden").eq("id", postId).maybeSingle();
    const traded = tradedMint(inputMint, outputMint);
    if (!post || post.kind !== "bag" || post.hidden || post.bag_mint !== traded || post.author === taker || post.author.startsWith("0x")) return null;
    const h = await holdingUsd(post.author, traded);
    if (h.usd == null || h.usd < CHILL_MIN_USD) return null;
    const holder = new PublicKey(post.author);
    const feeMint = feeMintFor(inputMint, outputMint);
    const conn = solanaConnection();
    if (feeMint === SOL_MINT) {
      if ((await conn.getBalance(holder).catch(() => 0)) < RENT_EXEMPT_MIN) return null;
    } else if (feeMint === USDC_MINT) {
      if (!(await conn.getAccountInfo(ataOf(holder, new PublicKey(USDC_MINT))).catch(() => null))) return null;
    } else return null;
    return { wallet: post.author as string, postId };
  })().catch(() => null);
  cache.set(key, { at: Date.now(), v });
  if (cache.size > 5000) cache.delete(cache.keys().next().value as string);
  return v;
}
