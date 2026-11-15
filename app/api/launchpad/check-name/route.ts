import { NextResponse } from "next/server";
import { checkNameAvailability } from "@/services/launchpad-service";
import { reservedTicker } from "@/lib/launch/reserved-tickers";
import { getWalletAddress } from "@/lib/auth/get-wallet";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const name   = searchParams.get("name")   ?? "";
  const ticker = searchParams.get("ticker") ?? "";

  if (!name || !ticker) {
    return NextResponse.json({ error: "name and ticker are required" }, { status: 400 });
  }
  // Prevent DoS via extremely long inputs
  if (name.length > 100 || ticker.length > 20) {
    return NextResponse.json({ nameAvailable: false, tickerAvailable: false });
  }

  const result = await checkNameAvailability(name, ticker);
  // Ticker DRC-20 réservé : indiqué à part, pour proposer une demande
  const r = await reservedTicker(ticker, await getWalletAddress().catch(() => null));
  if (r.reserved && !r.allowed) return NextResponse.json({ ...result, tickerAvailable: false, tickerReserved: true });
  return NextResponse.json(result);
}
