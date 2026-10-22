/** POST /api/posts/:id/repost — republie le post (ou annule le repost). 60 reposts par heure au plus. */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { UUID_RE } from "@/lib/social/posts";
import { notify } from "@/lib/social/notify";
import { recountReposts } from "@/lib/social/create-post";
import { rateHit } from "@/lib/rate-limit";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const s = await requireWallet();
  if ("error" in s) return s.error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // On republie toujours le post d'origine (pas un repost de repost)
  const { data: p } = await admin.from("posts").select("id, author, repost_of, hidden").eq("id", id).maybeSingle();
  if (!p || p.hidden) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  let target = p as { id: string; author: string };
  if (p.repost_of) {
    const { data: o } = await admin.from("posts").select("id, author, hidden").eq("id", p.repost_of).maybeSingle();
    if (!o || o.hidden) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    target = o;
  }

  const { data: existing } = await admin.from("posts").select("id").eq("author", s.wallet).eq("repost_of", target.id).maybeSingle();
  if (existing) {
    await admin.from("posts").delete().eq("id", existing.id).eq("author", s.wallet);
  } else {
    if (!(await rateHit(`repost:${s.wallet}`, 60, 3_600_000))) return NextResponse.json({ error: "Too many reposts, try again later" }, { status: 429 });
    const { error } = await admin.from("posts").insert({ author: s.wallet, body: "", images: [], repost_of: target.id });
    if (error && error.code !== "23505") return NextResponse.json({ error: error.message }, { status: 400 });
    if (!error) await notify([{ wallet: target.author, kind: "repost", actor: s.wallet, postId: target.id }]);
  }
  const repost_count = await recountReposts(admin, target.id);
  return NextResponse.json({ reposted: !existing, repost_count, post_id: target.id });
}
