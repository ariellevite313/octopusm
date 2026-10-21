/**
 * POST /api/admin/rewards { action: "revoke_trade", id } | { action: "revoke_share", id }
 * Annule un gain (trade ou partage) : le retire du registre ET du solde du bénéficiaire.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { UUID_RE } from "@/lib/social/posts";

export async function POST(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const { action, id } = (await req.json().catch(() => ({}))) as { action?: string; id?: string };
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  if (action === "revoke_trade") {
    const { data: r } = await admin.from("trade_rewards").select("kind, tx_id, beneficiary").eq("id", id).maybeSingle();
    if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await admin.from("referral_commissions").delete().eq("referrer_wallet", r.beneficiary).eq("referred_wallet", `trade:${r.kind}:${r.tx_id}`);
    await admin.from("trade_rewards").delete().eq("id", id);
    return NextResponse.json({ ok: true });
  }
  if (action === "revoke_share") {
    const { data: r } = await admin.from("share_rewards").select("sharer, market_id, amount_usdc, amount_clt").eq("id", id).maybeSingle();
    if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (Number(r.amount_usdc) > 0 || Number(r.amount_clt) > 0) {
      const { data: c } = await admin.from("referral_commissions").select("id").eq("referrer_wallet", r.sharer).eq("referred_wallet", `share:${r.market_id}`)
        .eq("amount_usdc", r.amount_usdc).eq("amount_clt", r.amount_clt).limit(1).maybeSingle();
      if (c) await admin.from("referral_commissions").delete().eq("id", c.id);
    }
    await admin.from("share_rewards").delete().eq("id", id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
