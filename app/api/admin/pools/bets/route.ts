import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/server";


// GET /api/admin/pools/bets?marketId=xxx&status=pending
// GET /api/admin/pools/bets?marketId=xxx&withPayout=1  (for PayoutsSection)
// Returns bets for a specific pool, filterable by status or with payout data
export async function GET(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const url = new URL(req.url);
  const marketId   = url.searchParams.get("marketId");
  const withPayout = url.searchParams.get("withPayout");

  const admin = createAdminClient() as any;

  // withPayout=1 mode: return all bets that have a payout amount set (for PayoutsSection)
  if (withPayout === "1") {
    const query = admin
      .from("mutuel_bets")
      .select("id, market_id, wallet_address, option_id, amount, token, payout_amount, payout_tx, paid_at, status, created_at")
      .not("payout_amount", "is", null)
      .order("created_at", { ascending: true });
    if (marketId) query.eq("market_id", marketId);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  // default mode: filter by status
  const status = url.searchParams.get("status") ?? "pending";

  const query = admin
    .from("mutuel_bets")
    .select("id, market_id, wallet_address, option_id, amount, token, tx_signature, status, created_at")
    .eq("status", status)
    .order("created_at", { ascending: true });

  if (marketId) query.eq("market_id", marketId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/admin/pools/bets
// body: { action: "approve"|"reject", betId: string }
export async function POST(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const body = await req.json() as { action: string; betId: string };
  const { action, betId } = body;

  if (!betId) return NextResponse.json({ error: "betId required" }, { status: 400 });

  const admin = createAdminClient() as any;

  // Fetch the bet
  const { data: bet, error: bErr } = await admin
    .from("mutuel_bets")
    .select("*")
    .eq("id", betId)
    .eq("status", "pending")
    .single();

  if (bErr || !bet)
    return NextResponse.json({ error: "Bet not found or already processed" }, { status: 404 });

  if (action === "reject") {
    const { error } = await admin
      .from("mutuel_bets")
      .update({ status: "rejected" })
      .eq("id", betId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "approve") {
    // 1. Mark bet as approved
    const { error: updErr } = await admin
      .from("mutuel_bets")
      .update({ status: "approved" })
      .eq("id", betId);

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    // 2. Atomically increment pool total now that bet is approved
    const { error: rpcErr } = await admin
      .rpc("increment_pool_total", {
        p_market_id: bet.market_id,
        p_token:     bet.token.toLowerCase(),
        p_amount:    Number(bet.amount),
      });

    if (rpcErr) {
      // Rollback bet status if RPC fails
      await admin.from("mutuel_bets").update({ status: "pending" }).eq("id", betId);
      return NextResponse.json({ error: rpcErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
