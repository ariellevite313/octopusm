/**
 * POST /api/chill/arc-record { hash, postId }
 * Enregistre la part (40 %) du détenteur après un achat ou une vente faits sur Arc depuis un post « sac ».
 * La transaction doit porter la marque du post (arcChillTag), signée par le trader lui-même : impossible de réclamer le trade
 * d'un autre. Expéditeur, routeur, token, succès, âge et montant sont relus sur la chaîne.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { isAddr } from "@/lib/swap/evm";
import { chillSharePct } from "@/lib/swap/chill";
import { holderLevel } from "@/lib/swap/chill-server";
import { ARC_CHILL_FEE_BPS, arcTradeUsdc } from "@/lib/swap/chill-arc";
import { arcChillTag } from "@/lib/swap/chill-arc-tag";
import { rateHit } from "@/lib/rate-limit";
import { getIp } from "@/lib/v1/helpers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await rateHit(`chill-arc:${getIp(req)}`, 30, 600_000))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const hash = typeof b.hash === "string" ? b.hash : "";
  const postId = typeof b.postId === "string" ? b.postId.toLowerCase() : "";
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash) || !/^[0-9a-f-]{36}$/.test(postId)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: post } = await (admin as any).from("posts").select("bag_mint, bag_chain, bag_holder, hidden").eq("id", postId).eq("kind", "bag").maybeSingle();
  const holder = String(post?.bag_holder ?? "").toLowerCase();
  const token = String(post?.bag_mint ?? "").toLowerCase();
  if (!post || post.hidden || post.bag_chain !== "arc" || !isAddr(token) || !isAddr(holder)) return NextResponse.json({ error: "Unknown post" }, { status: 404 });

  const t = await arcTradeUsdc(hash as `0x${string}`, token, arcChillTag(postId));
  if (!t.ok) return NextResponse.json({ error: t.error }, { status: t.retry ? 202 : 400 });
  if (t.taker === holder) return NextResponse.json({ ok: true, skipped: true });

  const fee = (t.usdc * BigInt(ARC_CHILL_FEE_BPS)) / 10_000n;   // frais OM : 0,5 % du montant en USDC
  // Part du détenteur selon son niveau Omero : de 10 % à 40 % des frais
  const sharePct = chillSharePct(await holderLevel(admin, holder));
  const owed = (fee * BigInt(sharePct)) / 100n;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from("chill_rewards").insert({
    post_id: postId, chain: "arc", holder, taker: t.taker, token, tx_hash: hash.toLowerCase(), fee_native: fee.toString(), owed_native: owed.toString(),
  });
  if (error && error.code !== "23505") { console.error("[chill arc-record]", error.message); return NextResponse.json({ error: "Could not record" }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
