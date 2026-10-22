/** GET /api/launchpad/fee-options — niveaux de frais Solana disponibles à la création. */
import { NextResponse } from "next/server";
import { lowFeeTierEnabled } from "@/lib/solana/dbc";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ low: lowFeeTierEnabled() }, { headers: { "Cache-Control": "public, s-maxage=60" } });
}
