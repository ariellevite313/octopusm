/**
 * POST   /api/communities/[slug]/pin  Épingler la communauté sur mon profil (il faut en être membre).
 * DELETE /api/communities/[slug]/pin  La retirer de mon profil.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { getCommunity, memberOf } from "@/lib/social/communities";

export const dynamic = "force-dynamic";

async function run(method: "POST" | "DELETE", slug: string) {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const c = await getCommunity(db, slug);
  if (!c) return NextResponse.json({ error: "Community not found" }, { status: 404 });
  if (method === "POST") {
    const me = await memberOf(db, c.id, s.wallet);
    if (!me || me.status !== "active") return NextResponse.json({ error: "Join the community first" }, { status: 403 });
    await db.from("wallets").update({ pinned_community_id: c.id }).eq("address", s.wallet);
  } else {
    await db.from("wallets").update({ pinned_community_id: null }).eq("address", s.wallet).eq("pinned_community_id", c.id);
  }
  return NextResponse.json({ ok: true });
}

export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) { return run("POST", (await params).slug); }
export async function DELETE(_req: Request, { params }: { params: Promise<{ slug: string }> }) { return run("DELETE", (await params).slug); }
