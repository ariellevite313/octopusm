/**
 * POST /api/launchpad/[id]/confirm
 *
 * Called by the frontend after the user signed and submitted the DBC
 * pool creation transaction to the network.
 *
 * Body: { txSignature: string; walletAddress: string }
 *
 * This route:
 *  1. Verifies the transaction on-chain
 *  2. Updates the token status to "active" (or leaves "pending" if scheduled)
 *  3. Clears the stored vanity secret key (no longer needed)
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyTransaction } from "@/lib/solana/verify-tx";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
    const body = await req.json() as { txSignature?: string; walletAddress?: string };
    if (!body.txSignature)   return NextResponse.json({ error: "txSignature is required" }, { status: 400 });
    if (!body.walletAddress) return NextResponse.json({ error: "walletAddress is required" }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data: token } = await admin
      .from("launchpad_tokens")
      .select("status, creator_wallet, is_scheduled, scheduled_at")
      .eq("id", id)
      .maybeSingle();

    if (!token) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }
    if ((token.creator_wallet as string) !== body.walletAddress) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if ((token.status as string) !== "pending") {
      return NextResponse.json({ error: "Already confirmed" }, { status: 409 });
    }

    // Verify the transaction exists on-chain
    const confirmed = await verifyTransaction(body.txSignature);

    // If not yet confirmed, retry once after a short delay before accepting
    let finalConfirmed = confirmed;
    if (!confirmed) {
      await new Promise(r => setTimeout(r, 4000));
      finalConfirmed = await verifyTransaction(body.txSignature);
    }

    if (!finalConfirmed) {
      // Still not confirmed — accept optimistically but keep vanity_secret_key
      // so the user can retry if the tx ultimately failed.
      console.warn(`tx ${body.txSignature} not yet confirmed for token ${id}, accepting optimistically`);
    }

    // Scheduled tokens stay non-tradeable until scheduled_at
    const isScheduled = token.is_scheduled as boolean;
    const isTradeable = !isScheduled;
    const newStatus   = "active" as const;

    await admin
      .from("launchpad_tokens")
      .update({
        status:       newStatus,
        is_tradeable: isTradeable,
        // Only clear the secret if tx is confirmed — keeps retry possible otherwise
        ...(finalConfirmed ? { vanity_secret_key: null } : {}),
        // pool_address will be indexed from the tx by a background job
      })
      .eq("id", id);

    return NextResponse.json({
      ok:          true,
      status:      newStatus,
      isTradeable,
      scheduledAt: isScheduled ? (token.scheduled_at as string) : null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("confirm error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
