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

    const hours = PERIOD_HOURS[periodKey] ?? null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    let sorted: [string, { wins: number; gains: number }][];

    // ── OMERO tab: query leaderboard_octo (OMERO is a reward, not a bet token) ──
    if (tokenKey === "octo") {
      let query = admin
        .from("leaderboard_octo")
        .select("wallet_address, total_octo")
        .order("total_octo", { ascending: false })
        .limit(limit);

      // Period filter via octo_transactions if needed
      if (hours !== null) {
        const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
        const { data: txRows } = await admin
          .from("octo_transactions")
          .select("wallet_address, amount")
          .gte("created_at", since);

        if (!txRows || txRows.length === 0) {
          return NextResponse.json({ entries: [] });
        }

        // Aggregate by wallet for the period
        const periodMap = new Map<string, number>();
        for (const tx of txRows as { wallet_address: string; amount: number }[]) {
          periodMap.set(tx.wallet_address, (periodMap.get(tx.wallet_address) ?? 0) + Number(tx.amount));
        }

        sorted = [...periodMap.entries()]
          .sort(([, a], [, b]) => b - a)
          .slice(0, limit)
          .map(([w, total]) => [w, { wins: 0, gains: total }]);
      } else {
        // All-time: use leaderboard_octo directly
        const { data: lbRows, error } = await query;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (!lbRows || lbRows.length === 0) return NextResponse.json({ entries: [] });

        sorted = (lbRows as { wallet_address: string; total_octo: number }[])
          .map((r) => [r.wallet_address, { wins: 0, gains: Number(r.total_octo) }] as [string, { wins: number; gains: number }]);
      }
    } else {
      // ── USDC / CLT tabs: query mutuel_bets ──────────────────────────────────
      const dbToken = TOKEN_MAP[tokenKey] ?? "usdc";

      let query = admin
        .from("mutuel_bets")
        .select("wallet_address, amount, payout_amount, created_at")
        .eq("token", dbToken)
        .not("payout_amount", "is", null);

      if (hours !== null) {
        const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
        query = query.gte("created_at", since);
      }

      const { data: bets, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const walletMap = new Map<string, { wins: number; gains: number }>();
      for (const bet of (bets ?? []) as { wallet_address: string; amount: number; payout_amount: number }[]) {
        const gain = (bet.payout_amount ?? 0) - (bet.amount ?? 0);
        if (gain <= 0) continue;
        const existing = walletMap.get(bet.wallet_address) ?? { wins: 0, gains: 0 };
        walletMap.set(bet.wallet_address, { wins: existing.wins + 1, gains: existing.gains + gain });
      }

      if (walletMap.size === 0) return NextResponse.json({ entries: [] });

      sorted = [...walletMap.entries()]
        .sort(([, a], [, b]) => b.gains - a.gains)
        .slice(0, limit);
    }

    if (sorted.length === 0) return NextResponse.json({ entries: [] });

    const wallets = sorted.map(([w]) => w);

    // Fetch profiles — data lives in the `wallets` table
    const { data: profiles } = await admin
      .from("wallets")
      .select("address, display_name, avatar_src")
      .in("address", wallets);

    // Also fetch octo balances
    const { data: octoRows } = await admin
      .from("leaderboard_octo")
      .select("wallet_address, total_octo")
      .in("wallet_address", wallets);

    const profileMap = new Map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (profiles ?? []).map((p: any) => [p.address, p])
    );
    const octoMap = new Map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (octoRows ?? []).map((r: any) => [r.wallet_address, Number(r.total_octo ?? 0)])
    );

    const entries: LeaderboardEntry[] = sorted.map(([wallet, { wins, gains }], i) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const profile = profileMap.get(wallet) as any;
      return {
        rank:           i + 1,
        wallet_address: wallet,
        display_name:   profile?.display_name ?? undefined,
        avatar_src:     profile?.avatar_src   ?? undefined,
        win_count:      wins,
        total_gains:    Math.round(gains * 1000) / 1000,
        octo_balance:   octoMap.get(wallet) ?? 0,
      };
    });

    return NextResponse.json({ entries });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
