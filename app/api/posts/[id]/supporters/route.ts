/**
 * GET /api/posts/:id/supporters?tab=tips|likes
 *  tips  : qui a envoyé des OMERO, du plus gros total au plus petit, avec le total du post
 *  likes : qui a liké, du plus récent au plus ancien
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/social/posts";
import { getProfiles } from "@/lib/profiles";

export const dynamic = "force-dynamic";
const MAX = 100;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const tab = new URL(req.url).searchParams.get("tab") === "likes" ? "likes" : "tips";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: post } = await admin.from("posts").select("id").eq("id", id).eq("hidden", false).maybeSingle();
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  if (tab === "likes") {
    const { data } = await admin.from("post_likes").select("wallet, created_at").eq("post_id", id).order("created_at", { ascending: false }).limit(MAX);
    const rows = (data ?? []) as { wallet: string }[];
    const profiles = await getProfiles(admin, rows.map((r) => r.wallet));
    return NextResponse.json({
      people: rows.map((r) => ({ wallet: r.wallet, name: profiles.get(r.wallet)?.name ?? null, avatar: profiles.get(r.wallet)?.avatar_src ?? null })),
    });
  }

  const { data, error } = await admin.from("post_tips").select("sender, amount").eq("post_id", id).limit(5000);
  if (error) return NextResponse.json({ people: [], total: 0, supporters: 0 });
  const sums = new Map<string, number>();
  let total = 0;
  for (const r of (data ?? []) as { sender: string; amount: number }[]) {
    const a = Number(r.amount) || 0;
    total += a;
    sums.set(r.sender, (sums.get(r.sender) ?? 0) + a);
  }
  const ranked = [...sums.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, MAX);
  const profiles = await getProfiles(admin, ranked.map(([w]) => w));
  return NextResponse.json({
    total,
    supporters: sums.size,
    people: ranked.map(([w, amount]) => ({ wallet: w, name: profiles.get(w)?.name ?? null, avatar: profiles.get(w)?.avatar_src ?? null, amount })),
  });
}
