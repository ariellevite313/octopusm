import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { awardOcto, OCTO_PER_CREATION } from "@/lib/octo";
import { resolvePool } from "@/lib/market/pool-resolve";


export async function GET(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status") ?? "pending";

  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from("mutuel_markets")
    .select("*")
    .eq("status", statusFilter)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  let body;

  try { body = await req.json(); }

  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { action, marketId } = body;

  if (!marketId || typeof marketId !== "string")
    return NextResponse.json({ error: "marketId required" }, { status: 400 });

  const sb = createAdminClient() as any;

  if (action === "approve") {
    // Fetch creator_wallet before update so we can award OCTO
    const { data: market } = await sb
      .from("mutuel_markets")
      .select("creator_wallet")
      .eq("id", marketId)
      .eq("status", "pending")
      .single();

    const { error } = await sb
      .from("mutuel_markets")
      .update({ status: "active" })
      .eq("id", marketId)
      .eq("status", "pending");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Award OCTO to creator now that the market is approved (fire and forget)
    if (market?.creator_wallet) {
      awardOcto(market.creator_wallet, OCTO_PER_CREATION, "task").catch(() => {});
    }

    revalidatePath("/pools");
    return NextResponse.json({ ok: true });
  }

  if (action === "reject") {
    const { reason } = body;
    if (!reason || typeof reason !== "string" || reason.trim().length === 0)
      return NextResponse.json({ error: "A rejection reason is required" }, { status: 400 });

    const { error } = await sb
      .from("mutuel_markets")
      .update({ status: "rejected", admin_notes: String(reason).slice(0, 500) })
      .eq("id", marketId)
      .eq("status", "pending");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    revalidatePath("/pools");
    return NextResponse.json({ ok: true });
  }

  if (action === "cancel") {
    const { data: market, error: mErr } = await sb
      .from("mutuel_markets")
      .select("id, status")
      .eq("id", marketId)
      .single();

    if (mErr || !market) return NextResponse.json({ error: "Market not found" }, { status: 404 });
    if (!["active", "closed"].includes(market.status))
      return NextResponse.json({ error: "Only active or closed markets can be cancelled" }, { status: 400 });

    // BUG-05 fix: only refund bets that were actually validated (approved)
    // pending/rejected bets never had real funds transferred
    const { data: allBets } = await sb
      .from("mutuel_bets")
      .select("id, amount")
      .eq("market_id", marketId)
      .eq("status", "approved");

    // M-02 fix: log errors on individual bet updates so partial failures are visible
    const cancelErrors: string[] = [];
    for (const bet of (allBets ?? [])) {
      const { error: updateErr } = await sb.from("mutuel_bets")
        .update({ payout_amount: Number(bet.amount) })
        .eq("id", bet.id);
      if (updateErr) cancelErrors.push(`bet ${bet.id}: ${updateErr.message}`);
    }
    if (cancelErrors.length > 0) {
      console.error("[pools/cancel] Some bet refunds failed:", cancelErrors);
    }

    const { error } = await sb
      .from("mutuel_markets")
      .update({ status: "cancelled", is_refund: true, admin_notes: "Market cancelled by admin, all stakes refunded" })
      .eq("id", marketId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, refunded: (allBets ?? []).length });
  }

  if (action === "close") {
    const { data: market, error: mErr } = await sb
      .from("mutuel_markets")
      .select("id, status, betting_closes_at")
      .eq("id", marketId)
      .single();

    if (mErr || !market) return NextResponse.json({ error: "Market not found" }, { status: 404 });
    if (market.status !== "active")
      return NextResponse.json({ error: "Only active markets can be closed" }, { status: 400 });

    const { error } = await sb
      .from("mutuel_markets")
      .update({ status: "closed" })
      .eq("id", marketId)
      .eq("status", "active");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    revalidatePath("/pools");
    return NextResponse.json({ ok: true });
  }

  if (action === "resolve") {
    const { winning_option_id } = body;
    if (!winning_option_id || typeof winning_option_id !== "string")
      return NextResponse.json({ error: "winning_option_id required" }, { status: 400 });
    const userClient = await (await import("@/lib/supabase/server")).createClient();
    const { data: { user: adminUser } } = await userClient.auth.getUser();
    const adminWallet: string | null = (adminUser as { app_metadata?: { wallet_address?: string } } | null)?.app_metadata?.wallet_address ?? null;
    const r = await resolvePool(sb, marketId, winning_option_id, adminWallet);
    return NextResponse.json(r.body, { status: r.status });
  }

  if (action === "mark_paid") {
    const { betId, payout_tx } = body;
    if (!betId) return NextResponse.json({ error: "betId required" }, { status: 400 });

    // BUG-06 fix: only pay if user has claimed AND not already paid
    const { data: updatedRows, error } = await sb
      .from("mutuel_bets")
      .update({
        paid_at: new Date().toISOString(),
        payout_tx: payout_tx ? String(payout_tx).slice(0, 120) : null,
      })
      .eq("id", betId)
      .not("payout_amount", "is", null)
      .not("claimed_at", "is", null)
      .is("paid_at", null)
      .select("id");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json({ error: "Bet not found, not claimed yet, or already paid" }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "mark_fee_refunded") {
    const { fee_refund_tx } = body;

    const { data: market, error: mErr } = await sb
      .from("mutuel_markets")
      .select("id, status, fee_refunded_at")
      .eq("id", marketId)
      .single();

    if (mErr || !market) return NextResponse.json({ error: "Market not found" }, { status: 404 });
    if (market.status !== "rejected")
      return NextResponse.json({ error: "Only rejected markets can have fee refunded" }, { status: 400 });
    if (market.fee_refunded_at)
      return NextResponse.json({ error: "Fee already marked as refunded" }, { status: 400 });

    const { error } = await sb
      .from("mutuel_markets")
      .update({
        fee_refunded_at: new Date().toISOString(),
        fee_refund_tx: fee_refund_tx ? String(fee_refund_tx).slice(0, 120) : null,
      })
      .eq("id", marketId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
