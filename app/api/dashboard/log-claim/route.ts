/**
 * POST /api/dashboard/log-claim
 *
 * Called by the client after a successful fee claim tx is signed & broadcast.
 * Inserts a row into creator_fee_claims for historical tracking.
 *
 * Body: { tokenId, walletAddress, amountSol, txSignature }
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

type Body = {
  tokenId:     string;
  walletAddress: string;
  amountSol:   number;
  txSignature: string;
};

export async function POST(req: Request) {
  try {
    const body = await req.json() as Partial<Body>;
    const { tokenId, walletAddress, amountSol, txSignature } = body;

    if (!tokenId || !walletAddress || amountSol == null || !txSignature) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    // Verify the token belongs to this wallet (security check)
    const { data: token } = await admin
      .from("launchpad_tokens")
      .select("creator_wallet")
      .eq("id", tokenId)
      .maybeSingle();

    if (!token || token.creator_wallet !== walletAddress) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { error } = await admin
      .from("creator_fee_claims")
      .insert({
        wallet:       walletAddress,
        token_id:     tokenId,
        amount_sol:   amountSol,
        tx_signature: txSignature,
      });

    if (error) {
      console.error("[log-claim] insert error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[log-claim] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
