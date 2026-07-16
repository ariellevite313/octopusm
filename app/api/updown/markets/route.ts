import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/updown/markets?symbol=BTCUSDT
 * Returns active (open) markets for a given symbol, plus the latest resolved ones.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol")?.toUpperCase();

  if (!symbol || !["BTCUSDT", "ETHUSDT", "SOLUSDT"].includes(symbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }

  const admin = createAdminClient() as any;

  // Get open markets (status=open inclut betting + LIVE phase)
  // Pas de filtre par date: la phase LIVE a closes_at passe mais resolve_at futur
  // La cron resolve-updown-markets ferme les marches sur resolve_at
  const { data: openData } = await admin
    .from("updown_markets")
    .select("*")
    .eq("symbol", symbol)
    .eq("status", "open")
    .order("closes_at", { ascending: true });

  // Get last resolved per duration (descending = most recent first)
  const { data: resolvedData, error } = await admin
    .from("updown_markets")
    .select("*")
    .eq("symbol", symbol)
    .eq("status", "resolved")
    .order("closes_at", { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group: earliest open (current slot) + latest resolved per duration
  const byDuration: Record<number, { open?: any; resolved?: any }> = {};
  for (const m of (openData ?? [])) {
    const d = m.duration_min as number;
    if (!byDuration[d]) byDuration[d] = {};
    if (!byDuration[d].open) byDuration[d].open = m;
  }
  for (const m of (resolvedData ?? [])) {
    const d = m.duration_min as number;
    if (!byDuration[d]) byDuration[d] = {};
    if (!byDuration[d].resolved) byDuration[d].resolved = m;
  }

  return NextResponse.json({ ok: true, markets: byDuration });
}
