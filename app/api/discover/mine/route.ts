/** GET /api/discover/mine : mes tokens OM en ligne (pour lister une app) et les fiches déjà créées. */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { APP_COLS } from "@/lib/discover-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const [{ data: toks }, { data: apps }] = await Promise.all([
    db.from("launchpad_tokens").select("id, ticker, name, logo_url, chain, status").ilike("creator_wallet", s.wallet).in("status", ["active", "graduating", "graduated"]).order("created_at", { ascending: false }).limit(50),
    db.from("discover_apps").select(APP_COLS).ilike("owner", s.wallet).limit(50),
  ]);
  return NextResponse.json({ tokens: toks ?? [], apps: apps ?? [] });
}
