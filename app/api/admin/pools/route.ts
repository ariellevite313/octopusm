import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";


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
    const { error } = await sb
      .from("mutuel_markets")
      .update({ status: "active" })
      .eq("id", marketId)
      .eq("status", "pending");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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

  if (action === "resolve") {
    const { winning_option_id } = body;
    if (!winning_option_id || typeof winning_option_id !== "string")
      return NextResponse.json({ error: "winning_option_id required" }, { status: 400 });

    const { data: market, error: mErr } = await sb
      .from("mutuel_markets")
      .select("*")
      .eq("id", marketId)
      .single();

    if (mErr || !market) return NextResponse.json({ error: "Market not found" }, { status: 404 });
    // BUG-22 fix: only allow resolution from "closed" status.
    // Resolving an "active" market would leave pending on-chain payments orphaned
    // (admin can't approve them since market.status !== "active" after resolution).
    if (market.status !== "closed")
      return NextResponse.json({ error: "Market must be closed before it can be resolved" }, { status: 400 });

    const options = typeof market.options === "string" ? JSON.parse(market.options) : market.options;
    const validOption = options.some((o: { id: string }) => o.id === winning_option_id);
    if (!validOption)
      return NextResponse.json({ error: "Invalid winning option" }, { status: 400 });

    const { data: allBets, error: bErr } = await sb
      .from("mutuel_bets")
      .select("*")
      .eq("market_id", marketId);

    if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });

    const bets = allBets ?? [];
    const token: string = market.bet_token;
    const totalPool: number = bets.reduce((s: number, b: { amount: number }) => s + Number(b.amount), 0);

    const winningBets = bets.filter((b: { option_id: string }) => b.option_id === winning_option_id);
    const losingBets  = bets.filter((b: { option_id: string }) => b.option_id !== winning_option_id);
    const winningTotal: number = winningBets.reduce((s: number, b: { amount: number }) => s + Number(b.amount), 0);
    const losingTotal:  number = losingBets.reduce((s: number, b: { amount: number }) => s + Number(b.amount), 0);

    // ── Fee structure ─────────────────────────────────────────────────────────
    // Rule 1 : 1% du volume total → créateur du marché
    // Rule 2 : 10% des fonds des perdants (USDC) / 8% (CLT) → plateforme
    // Rule 3 : 5% sur chaque retrait individuel (appliqué côté /api/pools/winnings)
    const CREATOR_RATE     = 0.01;
    const HOUSE_LOSER_RATE = token === "clawdtrust" ? 0.08 : 0.10;
    const creatorShare = totalPool * CREATOR_RATE;
    const commission   = losingTotal * HOUSE_LOSER_RATE;
    const winnersPool  = totalPool - creatorShare - commission;

    // Fairness rule: if nobody bet against the winner, no losers fund the pool,
    // so commission would come out of winners' own pockets. Refund everyone instead.
    const allBetOnWinner = losingBets.length === 0 && winningBets.length > 0;

    // M-02 fix: log errors on individual payout updates so partial failures are visible
    const resolveErrors: string[] = [];

    if (allBetOnWinner) {
      for (const bet of winningBets) {
        const { error: updateErr } = await sb.from("mutuel_bets")
          .update({ payout_amount: Number(bet.amount) })
          .eq("id", bet.id);
        if (updateErr) resolveErrors.push(`bet ${bet.id}: ${updateErr.message}`);
      }
    } else if (winningTotal > 0) {
      // Normal: winners split the winners pool proportionally
      for (const bet of winningBets) {
        const share = Number(bet.amount) / winningTotal;
        const payout = Math.floor(share * winnersPool * 1_000_000) / 1_000_000;
        const { error: updateErr } = await sb.from("mutuel_bets").update({ payout_amount: payout }).eq("id", bet.id);
        if (updateErr) resolveErrors.push(`bet ${bet.id}: ${updateErr.message}`);
      }
    }
    // else winningTotal === 0 with losers: house keeps pool, no payouts

    if (resolveErrors.length > 0) {
      console.error("[pools/resolve] Some payout updates failed:", resolveErrors);
    }

    const userClient = await (await import("@/lib/supabase/server")).createClient();
    const { data: { user: adminUser } } = await userClient.auth.getUser();
    const adminWallet: string | null = (adminUser as { user_metadata?: { wallet_address?: string } } | null)?.user_metadata?.wallet_address ?? null;

    // Store applied rates on the market for frontend transparency (BUG-23 fix)
    const ratesNote = allBetOnWinner
      ? "REFUND: all bettors chose the winning option, no commission taken"
      : `RATES:${JSON.stringify({
          creator_pct: CREATOR_RATE,
          house_on_losers_pct: HOUSE_LOSER_RATE,
          withdrawal_fee_pct: 0.05,
          losing_pool: losingTotal,
          creator_share: creatorShare,
          house_share: commission,
          winners_pool: winnersPool,
        })}`;

    const { error: resolveErr } = await sb
      .from("mutuel_markets")
      .update({
        status: "resolved",
        winning_option_id,
        resolved_at: new Date().toISOString(),
        resolved_by_wallet: adminWallet,
        is_refund: allBetOnWinner,
        admin_notes: ratesNote,
      })
      .eq("id", marketId);

    if (resolveErr) return NextResponse.json({ error: resolveErr.message }, { status: 500 });

    if (allBetOnWinner) {
      return NextResponse.json({
        ok: true,
        refund: true,
        summary: { token, total_pool: totalPool, refunded_count: winningBets.length },
      });
    }

    revalidatePath("/pools");
    return NextResponse.json({
      ok: true,
      refund: false,
      summary: {
        token,
        total_pool: totalPool,
        losing_pool: losingTotal,
        house_from_losers: commission,
        creator_share: creatorShare,
        winners_pool: winnersPool,
        winner_count: winningBets.length,
        loser_count: losingBets.length,
        rates: {
          creator_pct: CREATOR_RATE,
          house_on_losers_pct: HOUSE_LOSER_RATE,
          withdrawal_fee_pct: 0.05,
        },
      },
    });
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
