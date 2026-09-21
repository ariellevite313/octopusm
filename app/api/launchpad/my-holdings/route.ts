/**
 * GET /api/launchpad/my-holdings
 *
 * Retourne les tokens Arc V2 détenus par le wallet authentifié.
 * Source : table arc_holdings (indexée par le cron update-arc-holdings).
 *
 * Réponse :
 *  { holdings: HoldingItem[] }
 *
 * HoldingItem :
 *  id, name, ticker, logo_url, mint_address, arc_launch_id,
 *  price_usd, balance_raw
 */

import { NextResponse }        from "next/server";
import { getWalletAddress }    from "@/lib/auth/get-wallet";
import { createAdminClient }   from "@/lib/supabase/server";

export const revalidate = 0;

export async function GET() {
  const wallet = await getWalletAddress();
  if (!wallet) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data, error } = await admin
    .from("arc_holdings")
    .select(`
      balance_raw,
      updated_at,
      launchpad_tokens (
        id,
        name,
        ticker,
        logo_url,
        mint_address,
        arc_launch_id,
        price_usd,
        status
      )
    `)
    .eq("wallet", wallet.toLowerCase())
    .neq("balance_raw", "0");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const holdings = (data ?? [])
    .filter((row: { launchpad_tokens: unknown }) => row.launchpad_tokens)
    .map((row: { balance_raw: string; launchpad_tokens: Record<string, unknown> }) => ({
      ...row.launchpad_tokens,
      balance_raw: row.balance_raw,
    }));

  return NextResponse.json({ holdings });
}
