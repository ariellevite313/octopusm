/** GET /api/replies?author=<wallet>&limit=20 — dernières réponses d'un compte, avec un extrait du post d'origine (onglet « Réponses » du profil). */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfiles } from "@/lib/profiles";
import { normWallet } from "@/lib/social/posts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("author") ?? "";
  if (!/^([1-9A-HJ-NP-Za-km-z]{32,44}|0x[0-9a-fA-F]{40})$/.test(raw)) return NextResponse.json({ error: "author required" }, { status: 400 });
  const author = normWallet(raw);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "20") || 20, 1), 50);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data } = await admin.from("post_replies").select("id, post_id, body, created_at").eq("author", author).order("created_at", { ascending: false }).limit(limit);
  const rows = (data ?? []) as { id: string; post_id: string; body: string; created_at: string }[];
  const ids = [...new Set(rows.map((r) => r.post_id))];
  const { data: ps } = ids.length ? await admin.from("posts").select("id, author, body, hidden").in("id", ids) : { data: [] };
  const posts = new Map(((ps ?? []) as { id: string; author: string; body: string; hidden: boolean }[]).filter((p) => !p.hidden).map((p) => [p.id, p]));
  const profiles = await getProfiles(admin, [author, ...[...posts.values()].map((p) => p.author)]);
  const me = profiles.get(author);
  return NextResponse.json({
    replies: rows.filter((r) => posts.has(r.post_id)).map((r) => {
      const p = posts.get(r.post_id)!;
      return {
        id: r.id, post_id: r.post_id, body: r.body, created_at: r.created_at,
        author, author_name: me?.name ?? null, author_avatar: me?.avatar_src ?? null, author_octo: me?.octo ?? 0,
        parent: { author: p.author, author_name: profiles.get(p.author)?.name ?? null, excerpt: p.body.slice(0, 140) },
      };
    }),
  });
}
