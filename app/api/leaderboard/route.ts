import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export type LeaderboardToken = "usdc" | "clt" | "octo";
export type LeaderboardPeriod = "24h" | "7d" | "31d" | "all";

export interface LeaderboardEntry {
  rank: number;
  wallet_address: string;
  display_name: string | null;
  avatar_src: string | null;
  total_gains: number;
  win_count: number;
}

function getCutoff(period: LeaderboardPeriod): string | null {
  if (period === "all") return null;
  const ms = period === "24h" ? 86_400_000
           : period === "7d"  ? 7  * 86_400_000
           :                    31 * 86_400_000;
  return new Date(Date.now() - ms).toISOString();
}

function buildMap() {
  return {} as Record<string, { gains: number; wins: number }>;
}

function addToMap(
  map: Record<string, { gains: number; wins: number }>,
  wallet: string,
  gain: number,
  win: boolean
) {
  if (!wallet) return;
  if (!map[wallet]) map[wallet] = { gains: 0, wins: 0 };
  map[wallet].gains += gain;
  if (win) map[wallet].wins++;
}

// Fetch display_name + avatar_src for a list of wallet addresses
async function fetchWalletProfiles(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  addresses: string[]
): Promise<Record<string, { display_name: string | null; avatar_src: string | null }>> {
  if (addresses.length === 0) return {};
  const { data } = await admin
    .from("wallets")
    .select("address, display_name, avatar_src")
    .in("address", addresses);

  const out: Record<string, { display_name: string | null; avatar_src: string | null }> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (data ?? []) as any[]) {
    out[r.address] = { display_name: r.display_name ?? null, avatar_src: r.avatar_src ?? null };
  }
  return out;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const token  = (searchParams.get("token")  ?? "usdc") as LeaderboardToken;
  const period = (searchParams.get("period") ?? "all")  as LeaderboardPeriod;
  const limit  = Math.min(Number(searchParams.get("limit") ?? 20), 50);

  // Validate params
  const VALID_TOKENS  = ["usdc", "clt", "octo"] as const;
  const VALID_PERIODS = ["24h", "7d", "31d", "all"] as const;
  if (!VALID_TOKENS.includes(token as typeof VALID_TOKENS[number]))
    return NextResponse.json({ error: "invalid token" }, { status: 400 });
  if (!VALID_PERIODS.includes(period as typeof VALID_PERIODS[number]))
    return NextResponse.json({ error: "invalid period" }, { status: 400 });

  const cutoff = getCutoff(period);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // ── OCTO ─────────────────────────────────────────────────────────────────
  if (token === "octo") {
    let q = admin
      .from("octo_transactions")
      .select("wallet_address, amount")
      .gt("amount", 0);
    if (cutoff) q = q.gte("created_at", cutoff);
    const { data } = await q;

    const map = buildMap();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (data ?? []) as any[]) {
      addToMap(map, r.wallet_address, Number(r.amount ?? 0), true);
    }

    const sorted = Object.entries(map)
      .filter(([, v]) => v.gains > 0)
      .sort(([, a], [, b]) => b.gains - a.gains)
      .slice(0, limit);

    const profiles = await fetchWalletProfiles(admin, sorted.map(([w]) => w));

    const entries: LeaderboardEntry[] = sorted.map(([wallet, v], i) => ({
      rank:           i + 1,
      wallet_address: wallet,
      display_name:   profiles[wallet]?.display_name ?? null,
      avatar_src:     profiles[wallet]?.avatar_src   ?? null,
      total_gains:    Math.round(v.gains * 1_000_000) / 1_000_000,
      win_count:      v.wins,
    }));

    return NextResponse.json({ entries }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
    });
  }

  // ── USDC or CLT ───────────────────────────────────────────────────────────
  // updown_bets: no token column — always USDC
  // mutuel_bets uses "usdc" / "clawdtrust"
  // prediction_history uses "usdc" / "clawdtrust"
  const dbToken = token === "usdc" ? "usdc" : "clawdtrust";

  // 1. updown_bets — always USDC, skip entirely for CLT leaderboard
  let udQ = token === "usdc"
    ? admin
        .from("updown_bets")
        .select("wallet_address, amount, payout")
        .eq("status", "won")
    : null;
  if (udQ && cutoff) udQ = udQ.gte("created_at", cutoff);

  // 2. mutuel_bets — filter by payout_amount > 0 (status stays "approved" after resolution,
  //    never becomes "won"; payout_amount is set by the admin resolver)
  let mbQ = admin
    .from("mutuel_bets")
    .select("wallet_address, amount, payout_amount")
    .eq("token", dbToken)
    .gt("payout_amount", 0)
    .neq("status", "creator_fee");
  if (cutoff) mbQ = mbQ.gte("created_at", cutoff);

  // 3. prediction_history_with_status — result_status = "win"
  //    net_reward is the best field; fallback to payout - amount
  let predQ = admin
    .from("prediction_history_with_status")
    .select("wallet_address, amount, payout, net_reward")
    .eq("token", dbToken)
    .eq("result_status", "win");
  if (cutoff) predQ = predQ.gte("created_at", cutoff);

  const [udRes, { data: mbData }, { data: predData }] = await Promise.all([
    udQ ? udQ : Promise.resolve({ data: [] }),
    mbQ,
    predQ,
  ]);
  const udData = udRes.data;

  const map = buildMap();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (udData ?? []) as any[]) {
    const gain = Number(r.payout ?? 0) - Number(r.amount ?? 0);
    addToMap(map, r.wallet_address, gain, true);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (mbData ?? []) as any[]) {
    const gain = Number(r.payout_amount ?? 0) - Number(r.amount ?? 0);
    addToMap(map, r.wallet_address, gain, true);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (predData ?? []) as any[]) {
    const gain = Number(r.net_reward ?? 0) || (Number(r.payout ?? 0) - Number(r.amount ?? 0));
    addToMap(map, r.wallet_address, gain, true);
  }

  const sorted = Object.entries(map)
    .filter(([, v]) => v.gains > 0)
    .sort(([, a], [, b]) => b.gains - a.gains)
    .slice(0, limit);

  // Fetch wallet display info in one query
  const profiles = await fetchWalletProfiles(admin, sorted.map(([w]) => w));

  const entries: LeaderboardEntry[] = sorted.map(([wallet, v], i) => ({
    rank:           i + 1,
    wallet_address: wallet,
    display_name:   profiles[wallet]?.display_name ?? null,
    avatar_src:     profiles[wallet]?.avatar_src   ?? null,
    total_gains:    Math.round(v.gains * 1_000_000) / 1_000_000,
    win_count:      v.wins,
  }));

  return NextResponse.json({ entries }, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
  });
}
