/**
 * GET  /api/notifications?count=1 → { unread }
 * GET  /api/notifications          → { notifications: [...] } (50 dernières, avec auteur et extrait du post)
 * POST /api/notifications          → marque tout comme lu
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { getProfiles } from "@/lib/profiles";
import { normWallet } from "@/lib/social/posts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const w = await getWalletAddress();
  if (!w) return NextResponse.json({ unread: 0, notifications: [] });
  const me = normWallet(w);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  if (new URL(req.url).searchParams.get("count")) {
    const { count } = await admin.from("notifications").select("id", { count: "exact", head: true }).eq("wallet", me).eq("read", false);
    return NextResponse.json({ unread: count ?? 0 });
  }
  const { data } = await admin.from("notifications").select("id, kind, actor, post_id, read, created_at").eq("wallet", me).order("created_at", { ascending: false }).limit(50);
  const rows = (data ?? []) as { id: string; kind: string; actor: string; post_id: string | null; read: boolean; created_at: string }[];
  const postIds = [...new Set(rows.map((r) => r.post_id).filter(Boolean))] as string[];
  const [profiles, posts] = await Promise.all([
    getProfiles(admin, rows.map((r) => r.actor)),
    postIds.length ? admin.from("posts").select("id, body, hidden").in("id", postIds) : { data: [] },
  ]);
  const body = new Map<string, string>(((posts.data ?? []) as { id: string; body: string; hidden: boolean }[]).filter((p) => !p.hidden).map((p) => [p.id, p.body.slice(0, 120)]));
  return NextResponse.json({
    notifications: rows.map((r) => ({
      ...r,
      actor_name: profiles.get(r.actor)?.name ?? null,
      actor_avatar: profiles.get(r.actor)?.avatar_src ?? null,
      excerpt: r.post_id ? body.get(r.post_id) ?? null : null,
    })),
  });
}

export async function POST() {
  const w = await getWalletAddress();
  if (!w) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (createAdminClient() as any).from("notifications").update({ read: true }).eq("wallet", normWallet(w)).eq("read", false);
  return NextResponse.json({ ok: true });
}
