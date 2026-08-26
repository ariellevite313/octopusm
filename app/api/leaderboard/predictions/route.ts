/**
 * GET /api/leaderboard/predictions
 *
 * Top predictors ranked by net gains (payout - stake).
 * Query params:
 *   token  = "usdc" | "clt" | "octo"   (default: "usdc")
 *   period = "24h"  | "7d" | "31d" | "all" (default: "all")
 *   limit  = number (default: 20)
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const revalidate = 60;

export type LeaderboardEntry = {
  rank:          number;
  wallet_address: string;
  display_name?: string;
  avatar_src?:   string;
  win_count:     number;
  total_gains:   number;
  octo_balance:  number;
};

const TOKEN_MAP: Record<string, string> = {
  usdc: "usdc",
  clt:  "clawdtrust",
  octo: "octo",
};

const PERIOD_HOURS: Record<string, number | null> = {
  "24h": 24,
  "7d":  24 * 7,
  "31d": 24 * 31,
  "all": null,
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tokenKey  = searchParams.get("token")  ?? "usdc";
    const periodKey = searchParams.get("period") ?? "all";
    const limit     = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);

    const dbToken  = TOKEN_MAP[tokenKey] ?? "usdc";
    const hours    = PERIOD_HOURS[periodKey] ?? null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    // Build base query — only resolved (payout_amount not null) bets
    let query = admin
      .from("mutuel_bets")
      .select("wallet_address, amount, payout_amount, created_at")
      .eq("token", dbToken)
      .not("payout_amount", "is", null);

    // Period filter
    if (hours !== null) {
      const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
      query = query.gte("created_at", since);
    }

    const { data: bets, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Aggregate per wallet
    const walletMap = new Map<string, { wins: number; gains: number }>();

    for (const bet of (bets ?? []) as { wallet_address: string; amount: number; payout_amount: number }[]) {
      const gain = (bet.payout_amount ?? 0) - (bet.amount ?? 0);
      if (gain <= 0) continue; // only count actual wins

      const existing = walletMap.get(bet.wallet_address) ?? { wins: 0, gains: 0 };
      walletMap.set(bet.wallet_address, {
        wins:   existing.wins + 1,
        gains:  existing.gains + gain,
      });
    }

    if (walletMap.size === 0) {
      return NextResponse.json({ entries: [] });
    }

    // Sort by total gains desc
    const sorted = [...walletMap.entries()]
      .sort(([, a], [, b]) => b.gains - a.gains)
      .slice(0, limit);

    const wallets = sorted.map(([w]) => w);

    // Fetch profiles for display names + avatars
    const { data: profiles } = await admin
      .from("profiles")
      .select("wallet_address, username, avatar_url, octo_balance")
      .in("wallet_address", wallets);

    const profileMap = new Map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (profiles ?? []).map((p: any) => [p.wallet_address, p])
    );

    const entries: LeaderboardEntry[] = sorted.map(([wallet, { wins, gains }], i) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const profile = profileMap.get(wallet) as any;
      return {
        rank:          i + 1,
        wallet_address: wallet,
        display_name:  profile?.username ?? undefined,
        avatar_src:    profile?.avatar_url ?? undefined,
        win_count:     wins,
        total_gains:   Math.round(gains * 1000) / 1000,
        octo_balance:  profile?.octo_balance ?? 0,
      };
    });

    return NextResponse.json({ entries });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
