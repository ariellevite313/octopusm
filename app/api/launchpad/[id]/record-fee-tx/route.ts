/**
 * POST /api/launchpad/[id]/record-fee-tx
 *
 * Called by the client right after TX1 (fee payment) is broadcast.
 * Stores fee_paid_at so that if TX2 (pool creation) is rejected and the
 * user retries, prepare-fee-tx can skip TX1 (fee already paid).
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  const { id } = await params;
  try {
    const body = await req.json() as { walletAddress?: string; feeTxSig?: string };
    if (!body.walletAddress) {
      return NextResponse.json({ error: "walletAddress is required" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    // Verify ownership
    const { data: token } = await admin
      .from("launchpad_tokens")
      .select("creator_wallet")
      .eq("id", id)
      .maybeSingle();

    if (!token || token.creator_wallet !== body.walletAddress) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Store fee payment timestamp (column may not exist — fails silently)
    await admin
      .from("launchpad_tokens")
      .update({
        fee_paid_at:  new Date().toISOString(),
        fee_tx_sig:   body.feeTxSig ?? null,
      })
      .eq("id", id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("record-fee-tx error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
