/**
 * DEPRECATED — direct bet insertion bypasses admin validation.
 * All pool predictions go through: on-chain tx -> payments table -> admin approval -> mutuel_bets.
 * Use POST /api/pools/[id]/bets (public bet listing is GET) or submitPoolBet() in pool-betting.ts.
 */
import { NextResponse } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(_req: Request) {
  return NextResponse.json(
    { error: "This endpoint is deprecated. Predictions are submitted via the on-chain payment flow." },
    { status: 410 }
  );
}
