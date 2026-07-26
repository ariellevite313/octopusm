import { NextRequest, NextResponse } from "next/server";
import {
  getActiveMarkets,
  getActiveMarketsByCategory,
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

  // Fetch markets (fast indexed query)
  const markets = category
    ? await getActiveMarketsByCategory(category)
    : await getActiveMarkets();

  return NextResponse.json(
    { markets, volumes },
    {
      headers: {
        "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
      },
    }
  );
}
