import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

/**
 * GET /api/crypto/history?symbol=BTCUSDT&from=1722000000000&to=1722003600000
 *
 * Retourne les points de prix depuis price_history pour la plage demandée.
 * Utilisé par LiveChart au montage pour reconstituer l'historique même après
 * navigation hors de la page.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbol = searchParams.get("symbol");
  const from   = Number(searchParams.get("from"));
  const to     = Number(searchParams.get("to") ?? Date.now());

  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }
  if (!from || isNaN(from)) {
    return NextResponse.json({ error: "from required (ms timestamp)" }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("price_history")
    .select("time, price")
    .eq("symbol", symbol)
    .gte("time", from)
    .lte("time", to)
    .order("time", { ascending: true })
    .limit(3600); // max 1h de secondes

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Format compatible avec PricePoint du LiveChart
  const points = (data ?? []).map((r) => ({
    time:  r.time,
    price: Number(r.price),
    open:  Number(r.price),
    high:  Number(r.price),
    low:   Number(r.price),
  }));

  return NextResponse.json({ points });
}
