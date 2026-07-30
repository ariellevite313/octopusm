import { NextRequest, NextResponse } from "next/server";
import {
  getActiveMarketsUnified,
  getMarketVolumes,
} from "@/services/prediction-service";
import type { MarketVolumes } from "@/lib/market/utils";

// In-memory cache for volumes — shared across requests in the same process
// (works in dev and Node.js server; resets on cold start in serverless)
let _volumesCache: { data: MarketVolumes; ts: number } | null = null;
const VOLUMES_TTL = 5 * 60 * 1000; // 5 minutes

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category") ?? undefined;

  // Fetch volumes from cache or DB
  const now = Date.now();
  if (!_volumesCache || now - _volumesCache.ts > VOLUMES_TTL) {
    const data = await getMarketVolumes();
    _volumesCache = { data, ts: now };
  }
  const volumes = _volumesCache.data;

  // Fetch prediction + pool markets merged (fast parallel queries)
  const markets = await getActiveMarketsUnified(category ?? undefined);

  return NextResponse.json(
    { markets, volumes },
    {
      headers: {
        "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
      },
    }
  );
}
