/**
 * GET  /api/follow?wallet=<w>  → { followers, following, is_following }
 * POST /api/follow { wallet }  → bascule l'abonnement
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { requireWallet } from "@/lib/social/session";
import { normWallet } from "@/lib/social/posts";
import { notify } from "@/lib/social/notify";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("wallet");
  if (!raw) return NextResponse.json({ error: "wallet required" }, { status: 400 });
  const target = normWallet(raw);
  const me = await getWalletAddress();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const [a, b, c] = await Promise.all([
    admin.from("follows").select("follower", { count: "exact", head: true }).eq("following", target),
    admin.from("follows").select("following", { count: "exact", head: true }).eq("follower", target),
    me ? admin.from("follows").select("follower").eq("follower", normWallet(me)).eq("following", target).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return NextResponse.json({ followers: a.count ?? 0, following: b.count ?? 0, is_following: !!c.data });
}

export async function POST(req: Request) {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  const { wallet } = (await req.json().catch(() => ({}))) as { wallet?: string };
  if (!wallet) return NextResponse.json({ error: "wallet required" }, { status: 400 });
  const target = normWallet(wallet);
  if (target === s.wallet) return NextResponse.json({ error: "You cannot follow yourself" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: exists } = await admin.from("wallets").select("address").eq("address", target).maybeSingle();
  if (!exists) return NextResponse.json({ error: "Unknown wallet" }, { status: 404 });
  const { data: cur } = await admin.from("follows").select("follower").eq("follower", s.wallet).eq("following", target).maybeSingle();
  if (cur) await admin.from("follows").delete().eq("follower", s.wallet).eq("following", target);
  else { await admin.from("follows").insert({ follower: s.wallet, following: target }); await notify([{ wallet: target, kind: "follow", actor: s.wallet }]); }
  const { count } = await admin.from("follows").select("follower", { count: "exact", head: true }).eq("following", target);
  return NextResponse.json({ is_following: !cur, followers: count ?? 0 });
}
