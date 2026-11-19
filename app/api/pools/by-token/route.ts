/** GET /api/pools/by-token?mint=… : prédictions (pools) liées à un token, pour sa page dans le Terminal. */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const revalidate = 0;

export async function GET(req: Request) {
  const mint = new URL(req.url).searchParams.get("mint") ?? "";
  if (!/^([1-9A-HJ-NP-Za-km-z]{32,44}|0x[0-9a-fA-F]{40})$/.test(mint)) return NextResponse.json({ pools: [] });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from("mutuel_markets")
    .select("id, slug, title, options, status, bet_token, betting_closes_at, total_pool_usdc, total_pool_clt, bet_count, winning_option_id, cover_image_src")
    .eq("token_mint", mint)
    .in("status", ["active", "closed", "resolved"])
    .order("created_at", { ascending: false })
    .limit(10);
  // Colonne absente (migration pas encore passée) : simplement aucune prédiction
  if (error) return NextResponse.json({ pools: [] });
  return NextResponse.json({ pools: data ?? [] }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=30" } });
}
