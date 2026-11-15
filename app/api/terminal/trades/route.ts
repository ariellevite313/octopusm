/**
 * GET /api/terminal/trades?mint=…
 * Achats et ventes récents d'un token connus d'OM (tous les wallets), pour les marqueurs du graphique du Terminal.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { loadTokenTrades } from "@/lib/trade-card";

export const revalidate = 30;

export async function GET(req: Request) {
  const mint = (new URL(req.url).searchParams.get("mint") ?? "").trim();
  const evm = /^0x[0-9a-fA-F]{40}$/.test(mint);
  if (!evm && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) return NextResponse.json({ error: "invalid token" }, { status: 400 });
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { data: lt } = await db.from("launchpad_tokens").select("id, chain, arc_launch_id").ilike("mint_address", mint).maybeSingle();
    const list = await loadTokenTrades(db, evm ? "arc" : "solana", mint, lt ?? null, undefined, 400);
    const trades = list.map((t) => ({ w: t.wallet, s: t.side === "buy" ? "b" : "s", usd: Math.round(t.usd * 100) / 100, t: Math.floor(t.tsMs / 1000) }));
    return NextResponse.json({ trades }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } });
  } catch {
    return NextResponse.json({ trades: [] }, { status: 200 });
  }
}
