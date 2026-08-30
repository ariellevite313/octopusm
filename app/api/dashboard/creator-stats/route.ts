/**
 * GET /api/dashboard/creator-stats?wallet=xxx
 *
 * Returns historical claim data from creator_fee_claims:
 *   - totalClaimed: all-time SOL claimed
 *   - todayClaimed: SOL claimed today (UTC)
 *   - tokens: per-token breakdown of total SOL earned
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export type CreatorStatsToken = {
  tokenId:  string;
  name:     string;
  ticker:   string;
  logoUrl:  string | null;
  totalEarned: number;
};

export type CreatorStatsResponse = {
  totalClaimed: number;
  todayClaimed: number;
  tokens:       CreatorStatsToken[];
};

export async function GET(req: Request) {
  try {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet required" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Today midnight UTC
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);

  const [{ data: allClaims }, { data: todayClaims }] = await Promise.all([
    admin
      .from("creator_fee_claims")
      .select("token_id, amount_sol")
      .eq("wallet", wallet),
    admin
      .from("creator_fee_claims")
      .select("amount_sol")
      .eq("wallet", wallet)
      .gte("claimed_at", todayUtc.toISOString()),
  ]);

  const totalClaimed = ((allClaims ?? []) as { amount_sol: string }[])
    .reduce((s, r) => s + parseFloat(r.amount_sol), 0);

  const todayClaimed = ((todayClaims ?? []) as { amount_sol: string }[])
    .reduce((s, r) => s + parseFloat(r.amount_sol), 0);

  // Per-token aggregation
  const tokenTotals: Record<string, number> = {};
  for (const row of (allClaims ?? []) as { token_id: string; amount_sol: string }[]) {
    tokenTotals[row.token_id] = (tokenTotals[row.token_id] ?? 0) + parseFloat(row.amount_sol);
  }

  const tokenIds = Object.keys(tokenTotals);
  let tokens: CreatorStatsToken[] = [];

  if (tokenIds.length > 0) {
    const { data: tokenRows } = await admin
      .from("launchpad_tokens")
      .select("id, name, ticker, logo_url")
      .in("id", tokenIds);

    tokens = ((tokenRows ?? []) as { id: string; name: string; ticker: string; logo_url: string | null }[])
      .map(t => ({
        tokenId:     t.id,
        name:        t.name,
        ticker:      t.ticker,
        logoUrl:     t.logo_url,
        totalEarned: tokenTotals[t.id] ?? 0,
      }))
      .sort((a, b) => b.totalEarned - a.totalEarned);
  }

  return NextResponse.json({ totalClaimed, todayClaimed, tokens } satisfies CreatorStatsResponse);
  } catch (err) {
    console.error("[creator-stats] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
