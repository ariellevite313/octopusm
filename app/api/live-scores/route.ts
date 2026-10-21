/** GET /api/live-scores?scope=live|today — scores lus depuis notre base (aucun appel aux fournisseurs). */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const scope = new URL(req.url).searchParams.get("scope") === "live" ? "live" : "today";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const now = Date.now();
  let q = db.from("live_matches")
    .select("key, league, league_logo, home, home_logo, away, away_logo, score_home, score_away, status, minute, kickoff, updated_at")
    .order("kickoff", { ascending: true }).limit(300);
  q = scope === "live"
    ? q.in("status", ["live", "halftime"])
    : q.gte("kickoff", new Date(now - 12 * 3_600_000).toISOString()).lte("kickoff", new Date(now + 24 * 3_600_000).toISOString());
  const { data, error } = await q;
  if (error) return NextResponse.json({ matches: [] }, { status: 200 });
  return NextResponse.json({ matches: data ?? [] }, { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" } });
}
