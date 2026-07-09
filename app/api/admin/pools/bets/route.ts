import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

async function isAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).rpc("is_admin");
  return !!data;
}

// GET /api/admin/pools/bets?marketId=xxx
// GET /api/admin/pools/bets?marketId=xxx&withPayout=1  (include payout fields for admin payouts panel)
export async function GET(req: Request) {
  const supabase = await createClient();
  if (!(await isAdmin(supabase)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const marketId = url.searchParams.get("marketId");
  const withPayout = url.searchParams.get("withPayout") === "1";

  if (!marketId) return NextResponse.json({ error: "marketId required" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const selectFields = withPayout
    ? "id, wallet_address, option_id, amount, token, payout_amount, payout_tx, paid_at"
    : "option_id, amount";

  const { data, error } = await admin
    .from("mutuel_bets")
    .select(selectFields)
    .eq("market_id", marketId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
