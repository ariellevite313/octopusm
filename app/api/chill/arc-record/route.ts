/**
 * POST /api/chill/arc-record { hash, postId, taker, token, refToken }
 * Enregistre la part (40 %) du détenteur après un achat ou une vente faits sur Arc depuis un post « sac ». Le jeton signé (arc-ref)
 * prouve que le trade vient du post ; la transaction est relue sur la chaîne (expéditeur, routeur, token, succès) et le montant
 * vient de la chaîne, jamais du navigateur.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { isAddr } from "@/lib/swap/evm";
import { CHILL_EVM_SHARE_BPS, verifyRef } from "@/lib/swap/chill-evm";
import { ARC_CHILL_FEE_BPS, arcTradeUsdc } from "@/lib/swap/chill-arc";
import { ARC_DIRECT_ROUTER_ADDRESS } from "@/lib/arc-launchpad";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const hash = typeof b.hash === "string" ? b.hash : "";
  const postId = typeof b.postId === "string" ? b.postId : "";
  const taker = typeof b.taker === "string" ? b.taker.toLowerCase() : "";
  const token = typeof b.token === "string" ? b.token.toLowerCase() : "";
  const refToken = typeof b.refToken === "string" ? b.refToken : "";
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash) || !/^[0-9a-f-]{36}$/i.test(postId) || !isAddr(taker) || !isAddr(token) || !refToken) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: post } = await (admin as any).from("posts").select("bag_mint, bag_chain, bag_holder").eq("id", postId).eq("kind", "bag").maybeSingle();
  const holder = String(post?.bag_holder ?? "").toLowerCase();
  if (!post || post.bag_chain !== "arc" || String(post.bag_mint).toLowerCase() !== token || !isAddr(holder) || holder === taker) return NextResponse.json({ error: "Unknown post" }, { status: 404 });
  if (!verifyRef({ postId, chain: "arc", taker, to: ARC_DIRECT_ROUTER_ADDRESS || "0x", data: token, feeNative: "0", holder }, refToken)) return NextResponse.json({ error: "Unknown quote" }, { status: 400 });

  let t = await arcTradeUsdc(hash as `0x${string}`, taker, token);
  for (let i = 0; i < 5 && !t.ok && t.retry; i++) { await new Promise((r) => setTimeout(r, 1500)); t = await arcTradeUsdc(hash as `0x${string}`, taker, token); }
  if (!t.ok) return NextResponse.json({ error: t.error }, { status: t.retry ? 202 : 400 });

  const fee = (t.usdc * BigInt(ARC_CHILL_FEE_BPS)) / 10_000n;   // frais OM : 0,5 % du montant en USDC
  const owed = (fee * BigInt(CHILL_EVM_SHARE_BPS)) / 10_000n;   // 40 % pour le détenteur
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from("chill_rewards").insert({
    post_id: postId, chain: "arc", holder, taker, token, tx_hash: hash.toLowerCase(), fee_native: fee.toString(), owed_native: owed.toString(),
  });
  if (error && error.code !== "23505") { console.error("[chill arc-record]", error.message); return NextResponse.json({ error: "Could not record" }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
