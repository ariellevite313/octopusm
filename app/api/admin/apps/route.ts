/** POST /api/admin/apps { id } — coupe l'accès d'une application connectée (jeton OAuth). */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { UUID_RE } from "@/lib/social/posts";

export async function POST(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (createAdminClient() as any).from("oauth_tokens").update({ revoked: true }).eq("id", id);
  return NextResponse.json({ ok: true });
}
