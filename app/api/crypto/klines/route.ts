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

  const coinId = COINGECKO_IDS[symbol];

  try {
    // CoinGecko: 1 hour of data at minute granularity (no API key needed)
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=0.1&interval=minutely`,
      {
        headers: { "Accept": "application/json" },
        next: { revalidate: 0 },
      }
    );
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data: { prices: [number, number][] } = await res.json();
    // Return [{time, price}] — last 60 points max
    const points = data.prices.slice(-60).map(([time, price]) => ({ time, price }));
    return NextResponse.json(points);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch failed" },
      { status: 502 }
    );
  }
}
