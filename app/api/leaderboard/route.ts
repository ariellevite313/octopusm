/**
 * GET /api/leaderboard
 *
 * Returns the top creator wallets ranked by total SOL fees claimed.
 * Data comes from creator_fee_claims (confirmed on-chain claims only).
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const revalidate = 60;

export type LeaderboardEntry = {
  rank:         number;
  walletAddress: string;
  totalFeeSol:  number;
  tokenCount:   number;
  claimCount:   number;
};

export type LeaderboardResponse = {
  entries: LeaderboardEntry[];
  updatedAt: string;
};

export async function GET() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    // Aggregate claims by wallet
    const { data: claims, error: claimsError } = await admin
      .from("creator_fee_claims")
      .select("wallet_address, amount_sol");

    if (claimsError) {
      return NextResponse.json({ error: claimsError.message }, { status: 500 });
    }

    // Count tokens per wallet (only active/graduating/graduated)
    const { data: tokens, error: tokensError } = await admin
      .from("launchpad_tokens")
      .select("creator_wallet")
      .in("status", ["active", "graduating", "graduated"]);

    if (tokensError) {
      return NextResponse.json({ error: tokensError.message }, { status: 500 });
    }

    // Aggregate in JS
    const walletMap = new Map<string, { totalFeeSol: number; claimCount: number }>();

    for (const claim of (claims ?? []) as { wallet_address: string; amount_sol: number }[]) {
      const existing = walletMap.get(claim.wallet_address) ?? { totalFeeSol: 0, claimCount: 0 };
      walletMap.set(claim.wallet_address, {
        totalFeeSol: existing.totalFeeSol + (claim.amount_sol ?? 0),
        claimCount:  existing.claimCount + 1,
      });
    }

    // Count tokens per wallet
    const tokenCountMap = new Map<string, number>();
    for (const t of (tokens ?? []) as { creator_wallet: string }[]) {
      tokenCountMap.set(t.creator_wallet, (tokenCountMap.get(t.creator_wallet) ?? 0) + 1);
    }

    // Build sorted entries — only wallets with at least one claim
    const entries: LeaderboardEntry[] = [...walletMap.entries()]
      .map(([wallet, { totalFeeSol, claimCount }]) => ({
        walletAddress: wallet,
        totalFeeSol:   Math.round(totalFeeSol * 1e6) / 1e6,
        claimCount,
        tokenCount:    tokenCountMap.get(wallet) ?? 0,
      }))
      .sort((a, b) => b.totalFeeSol - a.totalFeeSol)
      .slice(0, 50)
      .map((entry, i) => ({ rank: i + 1, ...entry }));

    return NextResponse.json({
      entries,
      updatedAt: new Date().toISOString(),
    } satisfies LeaderboardResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
