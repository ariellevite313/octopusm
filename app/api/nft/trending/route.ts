/** GET /api/nft/trending : collections Solana populaires (API publique de Magic Eden), gardées 5 minutes. */
import { NextResponse } from "next/server";

export const revalidate = 300;

type Col = { symbol?: string; name?: string; image?: string; floorPrice?: number; volumeAll?: number; listedCount?: number };

export async function GET() {
  try {
    const r = await fetch("https://api-mainnet.magiceden.dev/v2/marketplace/popular_collections?timeRange=1d&limit=12", {
      headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000), next: { revalidate: 300 },
    });
    if (!r.ok) return NextResponse.json({ items: [] });
    const rows = (await r.json()) as Col[];
    const items = (Array.isArray(rows) ? rows : [])
      .filter((c) => c.symbol && /^[A-Za-z0-9_-]{1,64}$/.test(c.symbol))
      .map((c) => ({
        symbol: c.symbol as string, name: String(c.name ?? c.symbol).slice(0, 60),
        image: typeof c.image === "string" && c.image.startsWith("https://") ? c.image : null,
        floorSol: typeof c.floorPrice === "number" ? c.floorPrice / 1e9 : null,
        volumeSol: typeof c.volumeAll === "number" ? c.volumeAll / 1e9 : null,
      }));
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
