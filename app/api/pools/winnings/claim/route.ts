import { NextResponse } from "next/server";

/**
 * This endpoint is deprecated.
 * Payouts are now marked as paid exclusively by admins via POST /api/admin/pools (action: mark_paid).
 * Users no longer self-report receipt of payment.
 */
export async function POST() {
  return NextResponse.json(
    { error: "This endpoint is deprecated. Payouts are confirmed by admins only." },
    { status: 410 }
  );
}
