/**
 * GET /api/launchpad/mine
 *
 * Returns all launchpad tokens created by the authenticated wallet.
 * Wallet is read from the Supabase session — never from query params.
 */
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  try {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: { user } } = await (supabase as any).auth.getUser();
  const wallet: string | null = user?.user_metadata?.wallet_address ?? null;

  if (!wallet) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from("launchpad_tokens")
    .select(
      "id, name, ticker, category, logo_url, status, is_tradeable, is_scheduled, scheduled_at, mint_address, pool_address, creator_wallet, supply, created_at"
    )
    .eq("creator_wallet", wallet)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("launchpad/mine error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("[mine] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
