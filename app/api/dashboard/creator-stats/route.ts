/**
 * GET /api/dashboard/creator-stats?wallet=xxx[&chain=arc]
 *
 * Returns historical claim data from creator_fee_claims:
 *   - totalClaimed : all-time SOL (Solana) or USDC (Arc) claimed
 *   - todayClaimed : SOL/USDC claimed today (UTC)
 *   - tokens       : per-token breakdown
 *
 * For Arc wallets (0x…) the endpoint automatically uses amount_usdc.
 * Pass ?chain=arc explicitly to force Arc mode for any wallet address.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export type CreatorStatsToken = {
  tokenId:     string;
  name:        string;
  ticker:      string;
  logoUrl:     string | null;
  totalEarned: number;
};

export type CreatorStatsResponse = {
  totalClaimed: number;
  todayClaimed: number;
  tokens:       CreatorStatsToken[];
  chain:        "solana" | "arc";
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get("wallet");
    if (!wallet) return NextResponse.json({ error: "wallet required" }, { status: 400 });

    // Detect chain: explicit param OR infer from wallet format (0x… = EVM/Arc)
    const chainParam = searchParams.get("chain");
    const isArc =
      chainParam === "arc" ||
      (chainParam == null && wallet.startsWith("0x"));
    const chain: "solana" | "arc" = isArc ? "arc" : "solana";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    // Today midnight UTC
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);

    // For Arc: wallet address is case-insensitive (EVM).
    // Supabase .eq() is case-sensitive — do a case-insensitive filter for 0x wallets.
    const walletFilter = isArc ? wallet.toLowerCase() : wallet;

    const claimSelect = isArc
      ? "token_id, amount_usdc"
      : "token_id, amount_sol";

    const [{ data: allClaims }, { data: todayClaims }] = await Promise.all([
      admin
        .from("creator_fee_claims")
        .select(claimSelect)
        .eq("chain", chain)
        .ilike("wallet", walletFilter),   // ilike = case-insensitive LIKE (exact match when no wildcards)
      admin
        .from("creator_fee_claims")
        .select(isArc ? "amount_usdc" : "amount_sol")
        .eq("chain", chain)
        .ilike("wallet", walletFilter)
        .gte("claimed_at", todayUtc.toISOString()),
    ]);

    const amountField = isArc ? "amount_usdc" : "amount_sol";

    const totalClaimed = ((allClaims ?? []) as Record<string, string>[])
      .reduce((s, r) => s + parseFloat(r[amountField] ?? "0"), 0);

    const todayClaimed = ((todayClaims ?? []) as Record<string, string>[])
      .reduce((s, r) => s + parseFloat(r[amountField] ?? "0"), 0);

    // Per-token aggregation
    const tokenTotals: Record<string, number> = {};
    for (const row of (allClaims ?? []) as Record<string, string>[]) {
      const id = row["token_id"];
      if (id) tokenTotals[id] = (tokenTotals[id] ?? 0) + parseFloat(row[amountField] ?? "0");
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

    return NextResponse.json({ totalClaimed, todayClaimed, tokens, chain } satisfies CreatorStatsResponse);
  } catch (err) {
    console.error("[creator-stats] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
