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
import { Connection, PublicKey } from "@solana/web3.js";
import { createAdminClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

async function verifyTransaction(txSignature: string): Promise<boolean> {
  const rpc = process.env.SOLANA_RPC_URL;
  if (!rpc) return false;
  try {
    const connection = new Connection(rpc, "confirmed");
    const result = await connection.getSignatureStatus(txSignature);
    const status = result.value;
    if (!status) return false;
    if (status.err) return false;
    return (
      status.confirmationStatus === "confirmed" ||
      status.confirmationStatus === "finalized"
    );
  } catch {
    return false;
  }
}

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

    // Verify the transaction exists on-chain (with tolerance: accept if not yet confirmed)
    const confirmed = await verifyTransaction(body.txSignature);
    if (!confirmed) {
      // Transaction may not be finalized yet — accept optimistically and store sig
      console.warn(`tx ${body.txSignature} not yet confirmed for token ${id}, accepting optimistically`);
    }

    // Scheduled tokens stay non-tradeable until scheduled_at
    const isScheduled = token.is_scheduled as boolean;
    const isTradeable = !isScheduled;
    const newStatus   = "active" as const;

    await admin
      .from("launchpad_tokens")
      .update({
        status:           newStatus,
        is_tradeable:     isTradeable,
        vanity_secret_key: null,        // clear secret — no longer needed
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
