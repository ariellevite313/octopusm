/**
 * GET /api/launchpad/price-history?mint=...   (ou ?token=<id>)
 * Relevés de prix propres au token (secours quand les sources externes n'ont rien).
 * Réponse : { points: [{ t, p }] } — t en secondes, p en USD.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchSnapshots } from "@/lib/launch/snapshot-store";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mint = url.searchParams.get("mint");
  const token = url.searchParams.get("token");
  if (!mint && !token) return NextResponse.json({ points: [] });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const points = await fetchSnapshots(admin, { mint, tokenId: token });
  return NextResponse.json({ points }, { headers: { "Cache-Control": "public, s-maxage=60" } });
}
