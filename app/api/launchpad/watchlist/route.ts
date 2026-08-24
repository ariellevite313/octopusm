import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// GET /api/launchpad/watchlist?wallet=...
// Returns all token_ids the wallet is watching
export async function GET(req: Request) {
  const wallet = new URL(req.url).searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ tokenIds: [] });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("launchpad_watchlist")
    .select("token_id")
    .eq("wallet", wallet);

  const tokenIds = ((data ?? []) as { token_id: string }[]).map(r => r.token_id);
  return NextResponse.json({ tokenIds });
}
