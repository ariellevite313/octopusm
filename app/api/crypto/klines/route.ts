import { NextResponse } from "next/server";

export const runtime = "edge";

const COINGECKO_IDS: Record<string, string> = {
  BTCUSDT: "bitcoin",
  ETHUSDT: "ethereum",
  SOLUSDT: "solana",
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol    = searchParams.get("symbol")?.toUpperCase();
  const interval  = searchParams.get("interval") ?? "1s";
  const limit     = searchParams.get("limit")    ?? "60";
  const startTime = searchParams.get("startTime");
  const endTime   = searchParams.get("endTime");

  if (!symbol || !["BTCUSDT", "ETHUSDT", "SOLUSDT"].includes(symbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }

  // Primary: proxy Binance klines (real-time, accurate)
  try {
    let binanceUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    if (startTime) binanceUrl += `&startTime=${startTime}`;
    if (endTime)   binanceUrl += `&endTime=${endTime}`;

    const res = await fetch(binanceUrl, {
      headers: { "Accept": "application/json" },
      next: { revalidate: 0 },
    });
    if (res.ok) {
      const data: [number, string, string, string, string, ...unknown[]][] = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const points = data.map(k => ({
          time:  k[0] as number,
          price: parseFloat(k[4] as string),
          open:  parseFloat(k[1] as string),
          high:  parseFloat(k[2] as string),
          low:   parseFloat(k[3] as string),
        }));
        return NextResponse.json(points);
      }
    }
  } catch { /* fall through */ }

  // Fallback: CoinGecko market_chart (~1-5 min delay — last resort only)
  const coinId = COINGECKO_IDS[symbol];
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=0.1&interval=minutely`,
      { headers: { "Accept": "application/json" }, next: { revalidate: 0 } }
    );
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data: { prices: [number, number][] } = await res.json();
    const points = data.prices.slice(-60).map(([time, price]) => ({ time, price, open: price, high: price, low: price }));
    return NextResponse.json(points);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch failed" },
      { status: 502 }
    );
  }
}
