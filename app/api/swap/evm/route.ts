/**
 * POST /api/swap/evm { chain, side, token, amount, slippageBps, mode: "price" | "quote" }
 * Swaps Base / BNB Chain / HyperEVM via 0x (frais OM 0,3 %). « quote » renvoie la transaction à faire signer
 * par le portefeuille EVM connecté ; le serveur ne signe rien.
 */
import { NextResponse } from "next/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { createAdminClient } from "@/lib/supabase/server";
import { checkEvmInput, EvmSwapError, isAddr, zeroX } from "@/lib/swap/evm";
import { evmHolding, signRef } from "@/lib/swap/chill-evm";
import { CHILL_MIN_USD } from "@/lib/swap/chill";

/** Détenteur à créditer pour un swap lancé depuis un post « sac » EVM, ou null (post invalide, même personne, solde trop bas). */
async function resolveEvmRef(postId: unknown, chain: string, token: string, taker: string): Promise<string | null> {
  if (typeof postId !== "string" || !/^[0-9a-f-]{36}$/i.test(postId)) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: p } = await (createAdminClient() as any).from("posts").select("kind, hidden, bag_chain, bag_mint, bag_holder").eq("id", postId).maybeSingle();
  if (!p || p.kind !== "bag" || p.hidden || p.bag_chain !== chain || (p.bag_mint ?? "").toLowerCase() !== token.toLowerCase() || !isAddr(p.bag_holder)) return null;
  if (p.bag_holder.toLowerCase() === taker.toLowerCase()) return null;
  const h = await evmHolding(chain as never, p.bag_holder, token).catch(() => null);
  return h && h.usd != null && h.usd >= CHILL_MIN_USD ? (p.bag_holder as string).toLowerCase() : null;
}

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const w = await getWalletAddress();
  // Wallet EVM de la session, ou l'adresse EVM du compte de trading (le wallet signe, le serveur ne fait que chiffrer le devis)
  const taker = w && w.startsWith("0x") ? w : isAddr(b.taker) ? String(b.taker) : null;
  const c = checkEvmInput(b, taker);
  if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400 });
  try {
    const q = await zeroX(c.v, b.mode === "quote" ? "quote" : "price");
    // Swap lancé depuis un post « sac » : jeton signé qui lie cette transaction au post, pour cumuler la part du détenteur
    if (q.tx && q.feeNative && taker && b.refPost) {
      const holder = await resolveEvmRef(b.refPost, c.v.chain, c.v.token, taker);
      if (holder) return NextResponse.json({ ...q, ref: { postId: b.refPost, holder, feeNative: q.feeNative, taker, token: signRef({ postId: String(b.refPost), chain: c.v.chain, taker, to: q.tx.to, data: q.tx.data, feeNative: q.feeNative, holder }) } });
    }
    return NextResponse.json(q);
  } catch (e) {
    if (e instanceof EvmSwapError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[swap/evm]", e);
    return NextResponse.json({ error: "Could not get a price for this swap" }, { status: 500 });
  }
}
