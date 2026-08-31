/**
 * GET /api/launchpad/trending
 *
 * Returns the top 10 tokens by 24h volume (from DB stats, updated every 5 min by cron).
 * Revalidated every 5 minutes server-side.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const revalidate = 300;

export async function GET() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    const { data, error } = await admin
      .from("launchpad_tokens")
      .select("id,name,ticker,logo_url,mint_address,status,is_verified,market_cap_usd,volume_24h_usd,price_usd,created_at")
      .not("status", "in", "(pending,cancelled)")
      .not("mint_address", "is", null)
      .not("volume_24h_usd", "is", null)
      .order("volume_24h_usd", { ascending: false, nullsFirst: false })
      .limit(10);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ tokens: data ?? [] });
  } catch (err) {
    console.error("[launchpad/trending] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
