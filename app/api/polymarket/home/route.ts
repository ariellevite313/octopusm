/**
 * GET /api/polymarket/home?tag=slug
 * Vitrine Polymarket (lecture seule) : à la une, sujets du moment, catégories, marchés.
 */
import { NextResponse } from "next/server";
import { fetchPolymarketHome } from "@/lib/polymarket";

export const revalidate = 60;

export async function GET(req: Request) {
  const tag = new URL(req.url).searchParams.get("tag") ?? "";
  const safe = /^[a-z0-9-]{1,60}$/.test(tag) ? tag : undefined;
  try {
    const data = await fetchPolymarketHome(safe);
    return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch {
    return NextResponse.json({ featured: [], topics: [], categories: [], markets: [], usMap: {}, error: true });
  }
}
