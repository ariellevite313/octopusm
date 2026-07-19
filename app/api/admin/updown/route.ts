import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * GET  /api/admin/updown — list claimed bets pending payment
 * POST /api/admin/updown — mark bet as paid
 */
export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const admin = createAdminClient() as any;

  const { data, error } = await admin
    .from("updown_bets")
    .select(`
      id, market_id, wallet_address, direction, amount, payout, status, claimed_at, paid_at,
      updown_markets ( symbol, duration_min, strike_price, open_price, closes_at, outcome )
    `)
    .in("status", ["claimed", "paid"])
    .order("claimed_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[admin/updown] fetch error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  console.log("[admin/updown] bets found:", data?.length);
  return NextResponse.json({ ok: true, bets: data ?? [] });
}

export async function POST(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  let _body: { bet_id: string };

  try { _body = await req.json(); }

  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  
  const { bet_id } = _body;

  if (!bet_id) return NextResponse.json({ error: "bet_id required" }, { status: 400 });

  const admin = createAdminClient() as any;
  const { error } = await admin
    .from("updown_bets")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", bet_id)
    .eq("status", "claimed");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
