/**
 * POST /api/communities/[slug]/moderate { action, wallet?, post_id? }
 *   promote / demote : nommer ou retirer un modérateur (admin seulement)
 *   ban / unban      : retirer un membre ou le réintégrer (admin et modérateurs ; un modérateur ne peut pas bannir un modérateur)
 *   pin / unpin      : épingler un post de la communauté en haut de sa page (admin et modérateurs)
 *   remove_post      : retirer un post de la communauté (il reste sur le profil de son auteur)
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { normWallet } from "@/lib/social/posts";
import { getCommunity, memberOf } from "@/lib/social/communities";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  const { slug } = await params;
  const b = (await req.json().catch(() => ({}))) as { action?: string; wallet?: string; post_id?: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const c = await getCommunity(db, slug);
  if (!c) return NextResponse.json({ error: "Community not found" }, { status: 404 });
  const me = await memberOf(db, c.id, s.wallet);
  if (!me || me.status !== "active" || me.role === "member") return NextResponse.json({ error: "Moderators only" }, { status: 403 });
  const isAdmin = me.role === "admin";
  const deny = (m: string) => NextResponse.json({ error: m }, { status: 403 });

  if (b.action === "pin" || b.action === "unpin" || b.action === "remove_post") {
    if (!b.post_id || !UUID.test(b.post_id)) return NextResponse.json({ error: "Invalid post" }, { status: 400 });
    const { data: p } = await db.from("posts").select("id, community_id").eq("id", b.post_id).maybeSingle();
    if (!p || p.community_id !== c.id) return NextResponse.json({ error: "This post is not in the community" }, { status: 400 });
    if (b.action === "remove_post") {
      await db.from("posts").update({ community_id: null }).eq("id", p.id);
      if (c.pinned_post === p.id) await db.from("communities").update({ pinned_post: null }).eq("id", c.id);
    } else await db.from("communities").update({ pinned_post: b.action === "pin" ? p.id : null }).eq("id", c.id);
    return NextResponse.json({ ok: true });
  }

  if (!b.wallet) return NextResponse.json({ error: "Missing member" }, { status: 400 });
  const target = normWallet(b.wallet);
  const them = await memberOf(db, c.id, target);
  if (!them) return NextResponse.json({ error: "Not a member" }, { status: 404 });
  if (them.role === "admin") return deny("The admin can't be changed");

  if (b.action === "promote" || b.action === "demote") {
    if (!isAdmin) return deny("Only the admin can name moderators");
    await db.from("community_members").update({ role: b.action === "promote" ? "mod" : "member" }).eq("community_id", c.id).eq("wallet", target);
    return NextResponse.json({ ok: true });
  }
  if (b.action === "ban" || b.action === "unban") {
    if (them.role === "mod" && !isAdmin) return deny("Only the admin can remove a moderator");
    await db.from("community_members").update({ status: b.action === "ban" ? "banned" : "active", role: b.action === "ban" ? "member" : them.role }).eq("community_id", c.id).eq("wallet", target);
    if (b.action === "ban") await db.from("wallets").update({ pinned_community_id: null }).eq("address", target).eq("pinned_community_id", c.id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
