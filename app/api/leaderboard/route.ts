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
  displayName:  string | null;
  avatarSrc:    string | null;
};

export type LeaderboardResponse = {
  entries: LeaderboardEntry[];
  updatedAt: string;
};

const PERIOD_HOURS: Record<string, number | null> = {
  "24h": 24,
  "7d":  24 * 7,
  "30d": 24 * 30,
  "1y":  24 * 365,
  "all": null,
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const periodKey = searchParams.get("period") ?? "all";
    const hours     = PERIOD_HOURS[periodKey] ?? null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    // Aggregate claims by wallet
    // Note: column names are `wallet` and `claimed_at` (not wallet_address / created_at)
    let claimsQuery = admin
      .from("creator_fee_claims")
      .select("wallet, amount_sol");

    if (hours !== null) {
      const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
      claimsQuery = claimsQuery.gte("claimed_at", since);
    }

    const { data: claims, error: claimsError } = await claimsQuery;

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

    for (const claim of (claims ?? []) as { wallet: string; amount_sol: number }[]) {
      const existing = walletMap.get(claim.wallet) ?? { totalFeeSol: 0, claimCount: 0 };
      walletMap.set(claim.wallet, {
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
    const sortedWallets = [...walletMap.entries()]
      .map(([wallet, { totalFeeSol, claimCount }]) => ({
        walletAddress: wallet,
        totalFeeSol:   Math.round(totalFeeSol * 1e6) / 1e6,
        claimCount,
        tokenCount:    tokenCountMap.get(wallet) ?? 0,
      }))
      .sort((a, b) => b.totalFeeSol - a.totalFeeSol)
      .slice(0, 100);

    // Fetch profiles from wallets table
    const walletAddresses = sortedWallets.map(e => e.walletAddress);
    const { data: profiles } = walletAddresses.length > 0
      ? await admin
          .from("wallets")
          .select("address, display_name, avatar_src")
          .in("address", walletAddresses)
      : { data: [] };

    const profileMap = new Map<string, { display_name: string | null; avatar_src: string | null }>();
    for (const p of (profiles ?? []) as { address: string; display_name: string | null; avatar_src: string | null }[]) {
      profileMap.set(p.address, { display_name: p.display_name, avatar_src: p.avatar_src });
    }

    const entries: LeaderboardEntry[] = sortedWallets.map((entry, i) => {
      const profile = profileMap.get(entry.walletAddress);
      return {
        rank: i + 1,
        ...entry,
        displayName: profile?.display_name ?? null,
        avatarSrc:   profile?.avatar_src   ?? null,
      };
    });

    return NextResponse.json({
      entries,
      updatedAt: new Date().toISOString(),
    } satisfies LeaderboardResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
