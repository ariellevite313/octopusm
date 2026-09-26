/**
 * POST /api/dashboard/log-claim
 *
 * Called by the client after a successful fee claim tx is signed & broadcast.
 * Inserts a row into creator_fee_claims for historical tracking.
 *
 * Body (Solana): { tokenId, walletAddress, amountSol, txSignature }
 * Body (Arc):    { tokenId, walletAddress, amountSol: 0, amountUsdc, txSignature, chain: "arc" }
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

type Body = {
  tokenId:      string;
  walletAddress: string;
  amountSol:    number;
  txSignature:  string;
  // Arc-specific (optional)
  chain?:       "solana" | "arc";
  amountUsdc?:  number; // raw USDC amount (18-dec, as a JS number — may lose precision for display only)
  claimType?:   "creator" | "dividend"; // defaults to "creator"
};

export async function POST(req: Request) {
  try {
    const body = await req.json() as Partial<Body>;
    const { tokenId, walletAddress, amountSol, txSignature, chain, amountUsdc, claimType } = body;

    if (!tokenId || !walletAddress || amountSol == null || !txSignature) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    // Verify the token belongs to this wallet (security check).
    // Arc wallets are EVM (0x…); Solana wallets are base58.
    // The DB stores creator_wallet — must match.
    const { data: token } = await admin
      .from("launchpad_tokens")
      .select("creator_wallet")
      .eq("id", tokenId)
      .maybeSingle();

    if (!token) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    // Dividend claims: the claimant is a holder, not necessarily the creator —
    // skip the creator_wallet check (the on-chain tx is already broadcast).
    if (claimType !== "dividend") {
      // EVM addresses are case-insensitive — normalise before comparing
      const storedWallet  = (token.creator_wallet as string) ?? "";
      const isEvm         = walletAddress.startsWith("0x");
      const walletMatches = isEvm
        ? storedWallet.toLowerCase() === walletAddress.toLowerCase()
        : storedWallet === walletAddress;

      if (!walletMatches) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    }

    const { error } = await admin
      .from("creator_fee_claims")
      .insert({
        wallet:       walletAddress,
        token_id:     tokenId,
        amount_sol:   amountSol,
        tx_signature: txSignature,
        chain:        chain ?? "solana",
        amount_usdc:  amountUsdc ?? null,
        claim_type:   claimType ?? "creator",
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
