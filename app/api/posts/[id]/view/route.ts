/** POST /api/posts/:id/view — compte une vue unique par wallet (ou par IP si anonyme). */
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { UUID_RE } from "@/lib/social/posts";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const w = await getWalletAddress();
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const viewer = w ? `w:${w.toLowerCase()}` : `ip:${createHash("sha256").update(ip).digest("hex").slice(0, 24)}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { error } = await admin.from("post_views").insert({ post_id: id, viewer });
  if (error) return NextResponse.json({ counted: false }); // déjà vu
  const { count } = await admin.from("post_views").select("post_id", { count: "exact", head: true }).eq("post_id", id);
  await admin.from("posts").update({ view_count: count ?? 0 }).eq("id", id);
  return NextResponse.json({ counted: true, view_count: count ?? 0 });
}
