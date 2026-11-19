/** GET /api/pools/by-token?mint=… : prédictions (pools) liées à un token, pour sa page dans le Terminal. */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { ensureTokenPool } from "@/lib/market/token-pools";
import { limited } from "@/lib/limit";

export const revalidate = 0;

const CHAINS = new Set(["solana", "arc", "base", "bnb", "ethereum", "arbitrum", "polygon", "avalanche", "hyperliquid"]);

export async function GET(req: Request) {
  { const lim = await limited(req, "pools-by-token", 60); if (lim) return lim; }
  const u = new URL(req.url);
  const mint = u.searchParams.get("mint") ?? "";
  const chain = CHAINS.has(u.searchParams.get("chain") ?? "") ? u.searchParams.get("chain")! : /^0x/.test(mint) ? "arc" : "solana";
  if (!/^([1-9A-HJ-NP-Za-km-z]{32,44}|0x[0-9a-fA-F]{40})$/.test(mint)) return NextResponse.json({ pools: [] });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  // Pool automatique du token : créé à la première visite s'il n'en a pas (token assez gros et liquide)
  await ensureTokenPool(admin, chain, mint).catch(() => null);
  const { data, error } = await admin
    .from("mutuel_markets")
    .select("id, slug, title, options, category, match_key, status, bet_token, betting_closes_at, total_pool_usdc, total_pool_clt, bet_count, winning_option_id, cover_image_src, auto_target, auto_level")
    .eq("token_mint", mint)
    .in("status", ["active", "closed", "resolved"])
    .order("created_at", { ascending: false })
    .order("auto_target", { ascending: false, nullsFirst: false })
    .limit(10);
  // Colonne absente (migration pas encore passée) : simplement aucune prédiction
  if (error) return NextResponse.json({ pools: [] });
  return NextResponse.json({ pools: data ?? [] }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=30" } });
}
