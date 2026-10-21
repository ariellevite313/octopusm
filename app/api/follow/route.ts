import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";

const ADDR = /^([1-9A-HJ-NP-Za-km-z]{32,44}|0x[0-9a-fA-F]{40})$/;
const norm = (a: string) => (a.startsWith("0x") ? a.toLowerCase() : a);

/** GET /api/follow?wallet=X → { followers, following, isFollowing } */
export async function GET(req: Request) {
  const target = new URL(req.url).searchParams.get("wallet") ?? "";
  if (!ADDR.test(target)) return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
  const wallet = norm(target);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const me = await getWalletAddress();

  const [f1, f2, mine] = await Promise.all([
    admin.from("wallet_follows").select("*", { count: "exact", head: true }).eq("followed", wallet),
    admin.from("wallet_follows").select("*", { count: "exact", head: true }).eq("follower", wallet),
    me ? admin.from("wallet_follows").select("follower").eq("follower", norm(me)).eq("followed", wallet).maybeSingle()
       : Promise.resolve({ data: null }),
  ]);
  return NextResponse.json({
    followers: f1.count ?? 0,
    following: f2.count ?? 0,
    isFollowing: !!mine.data,
  });
}

async function handle(req: Request, follow: boolean) {
  const me = await getWalletAddress();
  if (!me) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  let body: { wallet?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const target = body.wallet ?? "";
  if (!ADDR.test(target)) return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
  const follower = norm(me), followed = norm(target);
  if (follower === followed) return NextResponse.json({ error: "You can't follow yourself" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { error } = follow
    ? await admin.from("wallet_follows").upsert({ follower, followed }, { onConflict: "follower,followed", ignoreDuplicates: true })
    : await admin.from("wallet_follows").delete().eq("follower", follower).eq("followed", followed);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const POST = (req: Request) => handle(req, true);
export const DELETE = (req: Request) => handle(req, false);
