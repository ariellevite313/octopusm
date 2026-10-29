/**
 * GET /api/launchpad/trending
 *
 * Returns the top tokens by 24h volume (from DB stats, updated every 5 min by cron).
 * Arc tokens always get at least a third of the list (their volume is smaller than Solana's).
 * Revalidated every 5 minutes server-side.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { maybeRefreshArcStats } from "@/lib/arc-stats";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const limit = Math.min(Math.max(parseInt(new URL(req.url).searchParams.get("limit") ?? "10") || 10, 1), 20);
  // Garde les stats Arc (volume 24 h) à jour même sans cron externe : non bloquant, au plus toutes les 5 min.
  maybeRefreshArcStats(new URL(req.url).origin);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    const COLS = "id,name,ticker,logo_url,mint_address,arc_launch_id,chain,status,is_verified,market_cap_usd,volume_24h_usd,price_usd,created_at";
    const base = () =>
      admin
        .from("launchpad_tokens")
        .select(COLS)
        .not("status", "in", "(pending,cancelled)")
        .not("mint_address", "is", null)
        .not("is_hidden", "is", true);

    // Arc a moins de volume que Solana : on lui réserve au moins le tiers de la liste, sinon il n'apparaît jamais.
    const arcQuota = Math.max(1, Math.ceil(limit / 3));
    const [all, arcTop] = await Promise.all([
      base().not("volume_24h_usd", "is", null).gt("volume_24h_usd", 0).order("volume_24h_usd", { ascending: false, nullsFirst: false }).limit(limit),
      base().eq("chain", "arc").not("volume_24h_usd", "is", null).gt("volume_24h_usd", 0).order("volume_24h_usd", { ascending: false, nullsFirst: false }).limit(arcQuota),
    ]);

    if (all.error) {
      return NextResponse.json({ error: all.error.message }, { status: 500 });
    }

    type Row = { id: string; chain: string | null; volume_24h_usd: number | null };
    const top = (all.data ?? []) as Row[];
    const arcRows = (arcTop.data ?? []) as Row[];
    const arcInTop = top.filter((t) => t.chain === "arc").length;
    let merged = top;
    if (arcInTop < arcQuota && arcRows.length > arcInTop) {
      // Complète avec les meilleurs tokens Arc absents, en retirant les derniers non-Arc pour garder `limit` lignes
      const have = new Set(top.map((t) => t.id));
      const extra = arcRows.filter((t) => !have.has(t.id)).slice(0, arcQuota - arcInTop);
      const room = Math.max(0, limit - extra.length);
      const kept: Row[] = [];
      let nonArc = 0;
      const nonArcAllowed = Math.max(0, room - arcInTop);
      for (const t of top) {
        if (t.chain === "arc") kept.push(t);
        else if (nonArc < nonArcAllowed) { kept.push(t); nonArc++; }
      }
      merged = [...kept, ...extra].sort((a, b) => (b.volume_24h_usd ?? 0) - (a.volume_24h_usd ?? 0));
    }

    return NextResponse.json({ tokens: merged.slice(0, limit) });
  } catch (err) {
    console.error("[launchpad/trending] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
