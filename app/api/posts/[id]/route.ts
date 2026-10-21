/** DELETE /api/posts/:id — suppression par l'auteur (ou un admin). */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { UUID_RE } from "@/lib/social/posts";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const s = await requireWallet();
  if ("error" in s) return s.error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: post } = await admin.from("posts").select("author, images").eq("id", id).maybeSingle();
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (post.author !== s.wallet) {
    const denied = await requireAdminApi();
    if (denied) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Supprime aussi les fichiers du stockage
  const paths = ((post.images ?? []) as string[]).map((u) => u.split("/post-images/")[1]).filter(Boolean);
  if (paths.length) await admin.storage.from("post-images").remove(paths);
  const { error } = await admin.from("posts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
