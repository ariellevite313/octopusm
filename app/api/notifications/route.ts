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

type Ann = { id: string; series: string; template: string; vars: Record<string, string | number>; href: string | null; publish_at: string };

/** Dans chaque série, seule l'annonce la plus récente déjà publiée compte (le rappel du jour remplace celui de la veille). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function currentAnnouncements(admin: any, me: string): Promise<(Ann & { read: boolean })[]> {
  const { data } = await admin.from("announcements").select("id, series, template, vars, href, publish_at").lte("publish_at", new Date().toISOString()).order("publish_at", { ascending: false }).limit(60);
  const latest = new Map<string, Ann>();
  for (const a of (data ?? []) as Ann[]) {
    const each = a.series === "hackathon-milestone" || a.series === "omero-post";
    // Posts d'Omero : seulement ceux des 3 derniers jours
    if (a.series === "omero-post" && Date.now() - new Date(a.publish_at).getTime() > 3 * 86400_000) continue;
    if (each || !latest.has(a.series)) latest.set(each ? a.id : a.series, a);
  }
  const list = [...latest.values()];
  if (list.length === 0) return [];
  const { data: reads } = await admin.from("announcement_reads").select("announcement_id").eq("wallet", me).in("announcement_id", list.map((a) => a.id));
  const seen = new Set(((reads ?? []) as { announcement_id: string }[]).map((r) => r.announcement_id));
  return list.map((a) => ({ ...a, read: seen.has(a.id) })).sort((x, y) => y.publish_at.localeCompare(x.publish_at));
}

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const w = await getWalletAddress();
  if (!w) return NextResponse.json({ unread: 0, notifications: [] });
  const me = normWallet(w);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  if (new URL(req.url).searchParams.get("count")) {
    const { count } = await admin.from("notifications").select("id", { count: "exact", head: true }).eq("wallet", me).eq("read", false);
    const anns = await currentAnnouncements(admin, me).catch(() => []);
    return NextResponse.json({ unread: (count ?? 0) + anns.filter((a) => !a.read).length });
  }
  const { data } = await admin.from("notifications").select("id, kind, actor, post_id, read, created_at").eq("wallet", me).order("created_at", { ascending: false }).limit(50);
  const rows = (data ?? []) as { id: string; kind: string; actor: string; post_id: string | null; read: boolean; created_at: string }[];
  const postIds = [...new Set(rows.map((r) => r.post_id).filter(Boolean))] as string[];
  const [profiles, posts] = await Promise.all([
    getProfiles(admin, rows.map((r) => r.actor)),
    postIds.length ? admin.from("posts").select("id, body, hidden").in("id", postIds) : { data: [] },
  ]);
  const body = new Map<string, string>(((posts.data ?? []) as { id: string; body: string; hidden: boolean }[]).filter((p) => !p.hidden).map((p) => [p.id, p.body.slice(0, 120)]));
  const announcements = await currentAnnouncements(admin, me).catch(() => []);
  return NextResponse.json({
    announcements,
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
  const admin = createAdminClient() as any;
  const me = normWallet(w);
  await admin.from("notifications").update({ read: true }).eq("wallet", me).eq("read", false);
  const unread = (await currentAnnouncements(admin, me).catch(() => [])).filter((a) => !a.read);
  if (unread.length) await admin.from("announcement_reads").upsert(unread.map((a) => ({ wallet: me, announcement_id: a.id })), { onConflict: "wallet,announcement_id", ignoreDuplicates: true });
  return NextResponse.json({ ok: true });
}
