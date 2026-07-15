import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol")?.toUpperCase();

  if (!symbol || !["BTCUSDT", "ETHUSDT", "SOLUSDT"].includes(symbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }

  try {
    // Last 30 x 1-minute candles → 30 price points
    const res = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&limit=30`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) throw new Error(`Binance ${res.status}`);
    const data: [number, string, string, string, string, ...unknown[]][] = await res.json();
    // Return [{time, price}] using close price of each candle
    const points = data.map((k) => ({ time: k[0], price: parseFloat(k[4]) }));
    return NextResponse.json(points);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch failed" },
      { status: 502 }
    );
  }
}
