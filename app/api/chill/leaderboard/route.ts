/** GET /api/chill/leaderboard?period=24h|7d|30d|1y|all : détenteurs qui ont le plus gagné avec « Chill ton sac ». */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { chillLeaderboard } from "@/lib/swap/chill-stats";

export const dynamic = "force-dynamic";
const cache = new Map<string, { at: number; v: unknown }>();

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams.get("period") ?? "all";
  const period = ["24h", "7d", "30d", "1y"].includes(p) ? p : "all";
  const hit = cache.get(period);
  if (hit && Date.now() - hit.at < 60_000) return NextResponse.json(hit.v);
  const v = { entries: await chillLeaderboard(createAdminClient(), period).catch(() => []) };
  cache.set(period, { at: Date.now(), v });
  return NextResponse.json(v);
}
