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
import { createAdminClient, createClient } from "@/lib/supabase/server";

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
    // Session obligatoire : le wallet connecté doit être celui qui réclame
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const sessionWallet = (user?.app_metadata?.wallet_address as string | undefined) ?? null;
    if (!sessionWallet) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json() as Partial<Body>;
    const { tokenId, walletAddress, amountSol, txSignature, chain, amountUsdc, claimType } = body;

    if (!tokenId || !walletAddress || amountSol == null || !txSignature) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    if (typeof walletAddress !== "string" || typeof txSignature !== "string" || typeof amountSol !== "number" || !Number.isFinite(amountSol) || amountSol < 0) {
      return NextResponse.json({ error: "Invalid fields" }, { status: 400 });
    }
    const same = walletAddress.startsWith("0x") ? walletAddress.toLowerCase() === sessionWallet.toLowerCase() : walletAddress === sessionWallet;
    if (!same) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

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
      return NextResponse.json({ error: "Could not record the claim" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[log-claim] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
