import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/server";


/**
 * GET /api/admin/pools/claims
 * Returns mutuel_bets where claimed_at IS NOT NULL and paid_at IS NULL.
 * These are the winnings the user has requested — admin needs to send tokens.
 */
export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from("mutuel_bets")
    .select(`
      id,
      wallet_address,
      option_id,
      amount,
      token,
      payout_amount,
      claimed_at,
      paid_at,
      created_at,
      mutuel_markets ( id, title, slug, winning_option_id, options, is_refund )
    `)
    .not("claimed_at", "is", null)
    .is("paid_at", null)
    .order("claimed_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/**
 * POST /api/admin/pools/claims
 * body: { betId: string, payout_tx?: string }
 * Marks a claimed bet as paid (admin confirms they sent the tokens).
 */
export async function POST(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  let _body: Record<string, unknown>;
  try { _body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { betId, payout_tx } = _body;

  if (!betId) return NextResponse.json({ error: "betId required" }, { status: 400 });

  const admin = createAdminClient() as any;

  // H-03 fix: atomic guard — only update if claimed_at IS NOT NULL and paid_at IS NULL.
  // Prevents two admins double-paying the same claim simultaneously.
  const { data: updated, error } = await admin
    .from("mutuel_bets")
    .update({
      paid_at: new Date().toISOString(),
      payout_tx: payout_tx ? String(payout_tx).slice(0, 120) : null,
    })
    .eq("id", betId)
    .not("claimed_at", "is", null)
    .is("paid_at", null)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated || updated.length === 0)
    return NextResponse.json({ error: "Bet not found, not claimed, or already paid" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
