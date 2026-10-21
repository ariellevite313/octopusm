/** POST /api/profile/featured-token { token_id: uuid | null } — choisir ou retirer son token recommandé. */
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { UUID_RE } from "@/lib/social/posts";

export async function POST(req: Request) {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  const { token_id } = (await req.json().catch(() => ({}))) as { token_id?: string | null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  if (token_id) {
    if (!UUID_RE.test(token_id)) return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    const { data: t } = await admin.from("launchpad_tokens").select("id, status, is_hidden").eq("id", token_id).maybeSingle();
    if (!t || t.is_hidden || !["active", "graduating", "graduated"].includes(t.status)) {
      return NextResponse.json({ error: "Only tokens launched on OMdotfun can be featured" }, { status: 400 });
    }
  }
  const { error } = await admin.from("wallets").update({ featured_token_id: token_id ?? null }).eq("address", s.wallet);
  if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 });
  revalidatePath(`/profile/${s.wallet}`);
  return NextResponse.json({ ok: true });
}
