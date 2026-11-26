/**
 * GET /api/auth/me : le wallet connecté vu par le serveur (cookie de session).
 * Sert de secours quand la session du navigateur n'est pas encore relue (sinon « Connect wallet » s'affichait alors qu'on est connecté).
 */
import { NextResponse } from "next/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";

export const dynamic = "force-dynamic";

export async function GET() {
  const wallet = await getWalletAddress().catch(() => null);
  return NextResponse.json({ wallet }, { headers: { "Cache-Control": "no-store" } });
}
