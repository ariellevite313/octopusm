/** POST /api/admin/moderation { action: "ban" | "unban" | "image_ok", wallet?, reason?, post_id? } */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { forgetBan } from "@/lib/moderation";
import { UUID_RE } from "@/lib/social/posts";

const norm = (w: string) => (/^0x[0-9a-fA-F]{40}$/.test(w) ? w.toLowerCase() : w);

export async function POST(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const b = (await req.json().catch(() => ({}))) as { action?: string; wallet?: string; reason?: string; post_id?: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  if (b.action === "image_ok") {
    if (!b.post_id || !UUID_RE.test(b.post_id)) return NextResponse.json({ error: "Invalid post" }, { status: 400 });
    await admin.from("posts").update({ images_checked: true }).eq("id", b.post_id);
    return NextResponse.json({ ok: true });
  }

  const wallet = typeof b.wallet === "string" ? norm(b.wallet.trim()) : "";
  if (!/^0x[0-9a-f]{40}$/.test(wallet) && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });

  if (b.action === "ban") {
    const reason = String(b.reason ?? "").slice(0, 300) || null;
    const { error } = await admin.from("banned_wallets").upsert({ wallet, reason, banned_by: "admin" }, { onConflict: "wallet" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Masque ses posts, coupe les applications connectées
    await admin.from("posts").update({ hidden: true }).eq("author", wallet);
    await admin.from("oauth_tokens").update({ revoked: true }).eq("wallet", wallet);
    forgetBan(wallet);
    return NextResponse.json({ ok: true });
  }
  if (b.action === "unban") {
    await admin.from("banned_wallets").delete().eq("wallet", wallet);
    forgetBan(wallet);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
