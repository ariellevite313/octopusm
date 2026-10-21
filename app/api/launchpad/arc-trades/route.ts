/**
 * GET /api/launchpad/arc-trades?curveAddress=0x...&limit=500
 *
 * Trades d'une bonding curve Arc V2 (graphique, carte du fil, positions).
 * Les trades sont lus sur la blockchain par tranches de 2 000 blocs et mémorisés en base (table arc_trades) :
 * chaque appel ne lit que les nouveaux blocs. Le cron /api/cron/update-arc-trades garde tous les tokens à jour.
 */
import { NextResponse } from "next/server";
import { readCurveTrades, syncCurveTrades } from "@/lib/arc-trades";

export const maxDuration = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const curveAddress = searchParams.get("curveAddress");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "500") || 500, 1000);
  if (!curveAddress || !/^0x[0-9a-fA-F]{40}$/.test(curveAddress)) {
    return NextResponse.json({ error: "curveAddress required (0x…)" }, { status: 400 });
  }
  try {
    // Lit les nouveaux blocs (borné), puis renvoie ce qui est en base — même si la lecture RPC échoue
    await syncCurveTrades(curveAddress, 40).catch((e) => console.error("[arc-trades] sync:", e instanceof Error ? e.message : e));
    const trades = await readCurveTrades(curveAddress, limit);
    return NextResponse.json({ trades }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[arc-trades]", err);
    return NextResponse.json({ error: "Could not load trades" }, { status: 500 });
  }
}
