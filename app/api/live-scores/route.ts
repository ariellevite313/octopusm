/** GET /api/live-scores?scope=live|today — scores lus depuis notre base (aucun appel aux fournisseurs). */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const scope = sp.get("scope") === "live" ? "live" : sp.get("scope") === "upcoming" ? "upcoming" : "today";
  const key = sp.get("key");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const now = Date.now();
  if (key) {
    const { data: one } = await db.from("live_matches")
      .select("key, league, league_logo, home, home_logo, away, away_logo, score_home, score_away, status, minute, kickoff, updated_at").eq("key", key).maybeSingle();
    return NextResponse.json({ match: one ?? null }, { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" } });
  }
  let q = db.from("live_matches")
    .select("key, league, league_logo, home, home_logo, away, away_logo, score_home, score_away, status, minute, kickoff, updated_at")
    .order("kickoff", { ascending: true }).limit(300);
  q = scope === "live"
    ? q.in("status", ["live", "halftime"])
    : scope === "upcoming"
    ? q.eq("status", "scheduled").gte("kickoff", new Date(now + 2 * 3_600_000).toISOString()).lte("kickoff", new Date(now + 10 * 86_400_000).toISOString())
    : q.gte("kickoff", new Date(now - 12 * 3_600_000).toISOString()).lte("kickoff", new Date(now + 24 * 3_600_000).toISOString());
  const { data, error } = await q;
  if (error) return NextResponse.json({ matches: [] }, { status: 200 });
  return NextResponse.json({ matches: data ?? [] }, { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" } });
}
