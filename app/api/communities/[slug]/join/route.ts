/**
 * POST   /api/communities/[slug]/join  Rejoindre (impossible si banni).
 * DELETE /api/communities/[slug]/join  Quitter (l'admin ne peut pas quitter sa communauté).
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { getCommunity, memberOf } from "@/lib/social/communities";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  const { slug } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const c = await getCommunity(db, slug);
  if (!c) return NextResponse.json({ error: "Community not found" }, { status: 404 });
  const me = await memberOf(db, c.id, s.wallet);
  if (me?.status === "banned") return NextResponse.json({ error: "You were removed from this community" }, { status: 403 });
  if (!me) {
    const { error } = await db.from("community_members").insert({ community_id: c.id, wallet: s.wallet, role: "member" });
    if (error && !/duplicate/i.test(error.message)) return NextResponse.json({ error: "Could not join" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, role: me?.role ?? "member" });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  const { slug } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const c = await getCommunity(db, slug);
  if (!c) return NextResponse.json({ error: "Community not found" }, { status: 404 });
  const me = await memberOf(db, c.id, s.wallet);
  if (!me || me.status !== "active") return NextResponse.json({ ok: true });
  if (me.role === "admin") return NextResponse.json({ error: "The admin can't leave their own community" }, { status: 400 });
  await db.from("community_members").delete().eq("community_id", c.id).eq("wallet", s.wallet);
  await db.from("wallets").update({ pinned_community_id: null }).eq("address", s.wallet).eq("pinned_community_id", c.id);
  return NextResponse.json({ ok: true });
}
