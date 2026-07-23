import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/services/admin-service";

const OCTO_PER_BET = 5;

/**
 * GET  /api/admin/updown/bets  — list pending updown bets
 * POST /api/admin/updown/bets  — approve or reject a bet
 */

export async function GET() {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from("updown_bets")
    .select("*, updown_markets(symbol, duration_min, strike_price, closes_at, status)")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let _body: { bet_id: string; action: "approve" | "reject" };
  try { _body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { bet_id, action } = _body;
  if (!bet_id || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Missing bet_id or action" }, { status: 400 });
  }

  const admin = createAdminClient() as any;

  // Fetch bet
  const { data: bet, error: betErr } = await admin
    .from("updown_bets")
    .select("*, updown_markets(status)")
    .eq("id", bet_id)
    .single();

  if (betErr || !bet) return NextResponse.json({ error: "Bet not found" }, { status: 404 });
  if (bet.status !== "pending") {
    return NextResponse.json({ error: `Bet already ${bet.status}` }, { status: 409 });
  }

  if (action === "reject") {
    await admin.from("updown_bets").update({ status: "rejected" }).eq("id", bet_id);
    // BUG-UD-4 FIX: pool n'est plus incrémenté à la soumission → pas de décrémentation ici
    return NextResponse.json({ ok: true, action: "rejected" });
  }

  // BUG-UD-4 FIX: Approve → incrémenter le pool maintenant (pas à la soumission)
  const poolCol = bet.direction === "up" ? "pool_up" : "pool_down";
  const { error: poolErr } = await admin.rpc("increment_updown_pool", {
    p_market_id: bet.market_id,
    p_column:    poolCol,
    p_amount:    Number(bet.amount),
  });
  if (poolErr) console.error("[admin/updown/bets] increment_updown_pool error:", poolErr.message);

  const { error: updateErr } = await admin
    .from("updown_bets")
    .update({ status: "approved" })
    .eq("id", bet_id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Attribuer OCTO au parieur
  const { error: octoErr } = await admin.from("octo_transactions").insert({
    wallet_address: bet.wallet_address,
    type:           "bet",
    amount:         OCTO_PER_BET,
  });
  if (octoErr) console.error("[updown/bets] octo_transactions insert:", octoErr.message);

  return NextResponse.json({ ok: true, action: "approved" });
}
