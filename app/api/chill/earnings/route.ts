/** GET /api/chill/earnings?wallet=… : total gagné avec « Chill ton sac » (affiché sur le profil). */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { chillEarnings } from "@/lib/swap/chill-stats";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const wallet = new URL(req.url).searchParams.get("wallet") ?? "";
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) return NextResponse.json({ usd: 0, trades: 0 });
  return NextResponse.json(await chillEarnings(createAdminClient(), wallet).catch(() => ({ usd: 0, trades: 0 })), { headers: { "Cache-Control": "public, max-age=60" } });
}
