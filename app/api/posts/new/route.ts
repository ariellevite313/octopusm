/**
 * GET /api/posts/new?since=<iso>&tab=foryou|following
 * Nombre de nouveaux posts depuis « since » (hors les siens) et les photos des 3 derniers auteurs,
 * pour la bulle « nouveaux posts » du fil. Requête légère (vérifiée toutes les 30 s).
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { normWallet } from "@/lib/social/posts";
import { getProfiles } from "@/lib/profiles";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const since = url.searchParams.get("since") ?? "";
  if (Number.isNaN(Date.parse(since))) return NextResponse.json({ count: 0, avatars: [] });
  const tab = url.searchParams.get("tab") === "following" ? "following" : "foryou";
  const w = await getWalletAddress();
  const viewer = w ? normWallet(w) : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  let q = admin.from("posts").select("author, created_at").eq("hidden", false).is("repost_of", null).gt("created_at", since).order("created_at", { ascending: false }).limit(50);
  if (viewer) q = q.neq("author", viewer);
  if (tab === "following") {
    if (!viewer) return NextResponse.json({ count: 0, avatars: [] });
    const { data: f } = await admin.from("follows").select("following").eq("follower", viewer);
    const list = ((f ?? []) as { following: string }[]).map((x) => x.following);
    if (!list.length) return NextResponse.json({ count: 0, avatars: [] });
    q = q.in("author", list);
  }
  const { data } = await q;
  const rows = (data ?? []) as { author: string }[];
  const authors = [...new Set(rows.map((r) => r.author))].slice(0, 3);
  const profiles = await getProfiles(admin, authors);
  return NextResponse.json({ count: rows.length, avatars: authors.map((a) => ({ wallet: a, avatar: profiles.get(a)?.avatar_src ?? null, name: profiles.get(a)?.name ?? null })) });
}
