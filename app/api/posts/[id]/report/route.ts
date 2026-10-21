/** POST /api/posts/:id/report — signale une publication (une fois par wallet, pas la sienne). */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { UUID_RE } from "@/lib/social/posts";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const s = await requireWallet();
  if ("error" in s) return s.error;
  const { reason } = (await req.json().catch(() => ({}))) as { reason?: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: post } = await admin.from("posts").select("author").eq("id", id).maybeSingle();
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (post.author === s.wallet) return NextResponse.json({ error: "You cannot report your own post" }, { status: 400 });
  const { error } = await admin.from("post_reports").insert({ post_id: id, reporter: s.wallet, reason: (reason ?? "").slice(0, 300) || null });
  if (error) return NextResponse.json({ ok: true, already: true });
  return NextResponse.json({ ok: true }, { status: 201 });
}
