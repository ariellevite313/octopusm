import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/services/admin-service";

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

  const { bet_id, action } = await req.json() as { bet_id: string; action: "approve" | "reject" };
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
    // Décrémenter le pool (le montant avait été ajouté dès la soumission du pari)
    const poolCol = bet.direction === "up" ? "pool_up" : "pool_down";
    await admin.rpc("increment_updown_pool", {
      p_market_id: bet.market_id,
      p_column:    poolCol,
      p_amount:    -Number(bet.amount),
    });
    return NextResponse.json({ ok: true, action: "rejected" });
  }

  // Approve: marquer comme approuvé (pool déjà incrémenté à la soumission)
  const { error: updateErr } = await admin
    .from("updown_bets")
    .update({ status: "approved" })
    .eq("id", bet_id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, action: "approved" });
}
