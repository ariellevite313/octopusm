/**
 * GET /api/polymarket?kind=trending|sports
 * Marchés Polymarket (lecture seule), mis en cache 60 s côté serveur.
 */
import { NextResponse } from "next/server";
import { fetchPolymarket } from "@/lib/polymarket";

export const revalidate = 60;

export async function GET(req: Request) {
  const kind = new URL(req.url).searchParams.get("kind") === "sports" ? "sports" : "trending";
  try {
    const markets = await fetchPolymarket(kind);
    return NextResponse.json({ markets }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch {
    return NextResponse.json({ markets: [], error: true }, { status: 200 });
  }
}
