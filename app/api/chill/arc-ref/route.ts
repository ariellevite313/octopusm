/**
 * POST /api/chill/arc-ref { postId, taker, token } : remet un jeton signé qui prouve qu'un achat ou une vente part bien d'un post « sac » d'Arc.
 * Le jeton sert ensuite à enregistrer la part (40 %) du détenteur (arc-record).
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { isAddr } from "@/lib/swap/evm";
import { signRef } from "@/lib/swap/chill-evm";
import { ARC_DIRECT_ROUTER_ADDRESS } from "@/lib/arc-launchpad";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { postId?: unknown; taker?: unknown; token?: unknown };
  const postId = typeof b.postId === "string" ? b.postId : "";
  const taker = typeof b.taker === "string" ? b.taker.toLowerCase() : "";
  const token = typeof b.token === "string" ? b.token.toLowerCase() : "";
  if (!/^[0-9a-f-]{36}$/i.test(postId) || !isAddr(taker) || !isAddr(token)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: post } = await (createAdminClient() as any).from("posts").select("bag_mint, bag_chain, bag_holder").eq("id", postId).eq("kind", "bag").maybeSingle();
  const holder = String(post?.bag_holder ?? "").toLowerCase();
  if (!post || post.bag_chain !== "arc" || String(post.bag_mint).toLowerCase() !== token || !isAddr(holder)) return NextResponse.json({ error: "Unknown post" }, { status: 404 });
  if (holder === taker) return NextResponse.json({ ref: null });
  const refToken = signRef({ postId, chain: "arc", taker, to: ARC_DIRECT_ROUTER_ADDRESS || "0x", data: token, feeNative: "0", holder });
  return NextResponse.json({ ref: { postId, refToken } });
}
