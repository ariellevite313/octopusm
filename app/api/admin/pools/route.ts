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

  const body = await req.json();
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

    const { data: allBets } = await sb
      .from("mutuel_bets")
      .select("id, amount")
      .eq("market_id", marketId);

    for (const bet of (allBets ?? [])) {
      await sb.from("mutuel_bets")
        .update({ payout_amount: Number(bet.amount) })
        .eq("id", bet.id);
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
    if (!["active", "closed"].includes(market.status))
      return NextResponse.json({ error: "Market cannot be resolved in its current state" }, { status: 400 });

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

    const isClt       = token === "clawdtrust";
    const houseRate   = isClt ? 0.10 : 0.15;
    const creatorRate = isClt ? 0.06 : 0.05;
    const winnersRate = isClt ? 0.84 : 0.80;
    const commission   = totalPool * houseRate;
    const creatorShare = totalPool * creatorRate;
    const winnersPool  = totalPool * winnersRate;

    const winningBets = bets.filter((b: { option_id: string }) => b.option_id === winning_option_id);
    const losingBets  = bets.filter((b: { option_id: string }) => b.option_id !== winning_option_id);
    const winningTotal: number = winningBets.reduce((s: number, b: { amount: number }) => s + Number(b.amount), 0);

    // Fairness rule: if nobody bet against the winner, no losers fund the pool,
    // so commission would come out of winners' own pockets. Refund everyone instead.
    const allBetOnWinner = losingBets.length === 0 && winningBets.length > 0;

    if (allBetOnWinner) {
      for (const bet of winningBets) {
        await sb.from("mutuel_bets")
          .update({ payout_amount: Number(bet.amount) })
          .eq("id", bet.id);
      }
    } else if (winningTotal > 0) {
      // Normal: winners split the winners pool proportionally
      for (const bet of winningBets) {
        const share = Number(bet.amount) / winningTotal;
        const payout = Math.floor(share * winnersPool * 1_000_000) / 1_000_000;
        await sb.from("mutuel_bets").update({ payout_amount: payout }).eq("id", bet.id);
      }
    }
    // else winningTotal === 0 with losers: house keeps pool, no payouts

    const userClient = await (await import("@/lib/supabase/server")).createClient();
    const { data: { user: adminUser } } = await userClient.auth.getUser();
    const adminWallet: string | null = (adminUser as { user_metadata?: { wallet_address?: string } } | null)?.user_metadata?.wallet_address ?? null;

    const notes = allBetOnWinner
      ? "REFUND: all bettors chose the winning option, no commission taken"
      : undefined;

    const { error: resolveErr } = await sb
      .from("mutuel_markets")
      .update({
        status: "resolved",
        winning_option_id,
        resolved_at: new Date().toISOString(),
        resolved_by_wallet: adminWallet,
        is_refund: allBetOnWinner,
        ...(notes ? { admin_notes: notes } : {}),
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
        house: commission,
        creator_share: creatorShare,
        winners_pool: winnersPool,
        winner_count: winningBets.length,
        loser_count: losingBets.length,
        rates: { house: houseRate, creator: creatorRate, winners: winnersRate },
      },
    });
  }

  if (action === "mark_paid") {
    const { betId, payout_tx } = body;
    if (!betId) return NextResponse.json({ error: "betId required" }, { status: 400 });

    const { error } = await sb
      .from("mutuel_bets")
      .update({
        paid_at: new Date().toISOString(),
        payout_tx: payout_tx ? String(payout_tx).slice(0, 120) : null,
      })
      .eq("id", betId)
      .not("payout_amount", "is", null);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
