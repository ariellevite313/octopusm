import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export const revalidate = 0;

const FREE_DAILY_LIMIT       = 2;
const EXTRA_MARKET_COST_OCTO = 500;

export async function GET() {
  const userClient = await createClient() as any;
  const { data: { user } } = await userClient.auth.getUser();
  const wallet: string | null = user?.user_metadata?.wallet_address ?? null;
  if (!wallet) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminClient() as any;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [{ count: todayCount }, { data: txns }] = await Promise.all([
    admin
      .from("mutuel_markets")
      .select("id", { count: "exact", head: true })
      .eq("creator_wallet", wallet)
      .gte("created_at", todayStart.toISOString()),
    admin
      .from("octo_transactions")
      .select("amount")
      .eq("wallet_address", wallet),
  ]);

  const octoBalance = ((txns ?? []) as { amount: number }[])
    .reduce((s, t) => s + Number(t.amount), 0);

  return NextResponse.json({
    today_count:   todayCount ?? 0,
    free_limit:    FREE_DAILY_LIMIT,
    cost_octo:     EXTRA_MARKET_COST_OCTO,
    octo_balance:  Math.floor(octoBalance),
    is_free:       (todayCount ?? 0) < FREE_DAILY_LIMIT,
    can_create:    (todayCount ?? 0) < FREE_DAILY_LIMIT || octoBalance >= EXTRA_MARKET_COST_OCTO,
  });
}
