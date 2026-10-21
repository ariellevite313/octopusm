/**
 * GET /api/cron/update-arc-stats
 *
 * Met à jour price_usd, market_cap_usd et volume_24h_usd pour tous les tokens Arc V2 actifs.
 * Sécurisé par CRON_SECRET. (La logique est dans lib/arc-stats.ts.)
 */

import { NextResponse } from "next/server";
import { refreshArcStats } from "@/lib/arc-stats";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const r = await refreshArcStats(new URL(req.url).origin);
    console.log(`[update-arc-stats] updated=${r.updated} failed=${r.failed}/${r.total}`);
    return NextResponse.json(r);
  } catch (err) {
    console.error("[update-arc-stats]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
