import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import type { LaunchpadToken } from "@/services/launchpad-service";

// Public columns to select (mirrors launchpad-service to avoid exposing secrets)
const PUBLIC_COLUMNS = [
  "id","name","ticker","category","description","logo_url","banner_url","whitepaper_url",
  "website","twitter","telegram","discord","other_social",
  "mint_address","pool_address","creator_wallet","supply",
  "creator_fee_pct","platform_fee_pct","fee_recipients",
  "share_top100","share_top100_pct","is_scheduled","scheduled_at",
  "first_buy_amount","status","is_verified","is_tradeable","metadata_uri",
  "created_at","updated_at",
  "price_usd","market_cap_usd","volume_24h_usd","stats_updated_at",
].join(",");

/**
 * GET /api/launchpad/watchlist?wallet=...
 *
 * Returns all watched token IDs + their full token data for the given wallet.
 * Response: { tokenIds: string[]; tokens: LaunchpadToken[] }
 */
export async function GET(req: Request) {
  const wallet = new URL(req.url).searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ tokenIds: [], tokens: [] });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // 1. Fetch watched token IDs
  const { data: watchRows } = await admin
    .from("launchpad_watchlist")
    .select("token_id")
    .eq("wallet", wallet);

  const tokenIds = ((watchRows ?? []) as { token_id: string }[]).map(r => r.token_id);

  if (tokenIds.length === 0) {
    return NextResponse.json({ tokenIds: [], tokens: [] });
  }

  // 2. Fetch full token data for watched IDs
  const { data: tokenRows } = await admin
    .from("launchpad_tokens")
    .select(PUBLIC_COLUMNS)
    .in("id", tokenIds)
    .not("is_hidden", "is", true)
    .order("created_at", { ascending: false });

  const tokens = (tokenRows ?? []) as LaunchpadToken[];

  // 3. Batch-fetch creator display names
  const walletAddrs = [...new Set(tokens.map((t: LaunchpadToken) => t.creator_wallet).filter(Boolean))];
  if (walletAddrs.length > 0) {
    const { data: walletRows } = await admin
      .from("wallets")
      .select("address, display_name")
      .in("address", walletAddrs);
    if (walletRows) {
      const nameMap = new Map(
        (walletRows as { address: string; display_name: string | null }[]).map(w => [w.address, w.display_name]),
      );
      tokens.forEach((t: LaunchpadToken) => {
        t.creator_display_name = nameMap.get(t.creator_wallet) ?? null;
      });
    }
  }

  return NextResponse.json({ tokenIds, tokens });
}
