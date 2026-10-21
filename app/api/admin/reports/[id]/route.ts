/** POST /api/admin/reports/:id { action: "hide" | "delete" | "dismiss" } — modération d'un signalement. */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { UUID_RE } from "@/lib/social/posts";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const { id } = await params; // id = post_id
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  if (action === "hide") {
    await admin.from("posts").update({ hidden: true }).eq("id", id);
    await admin.from("post_reports").update({ status: "hidden" }).eq("post_id", id);
  } else if (action === "delete") {
    const { data: p } = await admin.from("posts").select("images").eq("id", id).maybeSingle();
    const paths = ((p?.images ?? []) as string[]).map((u) => u.split("/post-images/")[1]).filter(Boolean);
    if (paths.length) await admin.storage.from("post-images").remove(paths);
    await admin.from("posts").delete().eq("id", id);
  } else if (action === "dismiss") {
    await admin.from("post_reports").update({ status: "dismissed" }).eq("post_id", id).eq("status", "open");
  } else {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
