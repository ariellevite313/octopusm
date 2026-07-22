import { NextResponse } from "next/server";

export const runtime = "edge";

const COINGECKO_IDS: Record<string, string> = {
  BTCUSDT: "bitcoin",
  ETHUSDT: "ethereum",
  SOLUSDT: "solana",
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol")?.toUpperCase();

  if (!symbol || !["BTCUSDT", "ETHUSDT", "SOLUSDT"].includes(symbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }

  // Primary: Binance ticker/price (real-time, sub-second)
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
      { headers: { "Accept": "application/json" }, next: { revalidate: 0 } }
    );
    if (res.ok) {
      const data: { symbol: string; price: string } = await res.json();
      if (data.price) return NextResponse.json({ price: data.price, source: "binance" });
    }
  } catch { /* fall through */ }

  // Fallback: CoinGecko (~1-5 min delay on free plan — acceptable only as last resort)
  const coinId = COINGECKO_IDS[symbol];
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
      { headers: { "Accept": "application/json" }, next: { revalidate: 0 } }
    );
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data: Record<string, { usd: number }> = await res.json();
    const price = data[coinId]?.usd;
    if (!price) throw new Error("No price data");
    return NextResponse.json({ price: String(price), source: "coingecko" });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch failed" },
      { status: 502 }
    );
  }
}
