import { NextResponse } from "next/server";

/**
 * POST /api/pools/winnings/claim — REMOVED
 * Winnings are credited automatically to the balance. No claim step required.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Claim system removed — winnings are credited automatically to your balance." },
    { status: 410 },
  );
}
