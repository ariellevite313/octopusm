/**
 * POST /api/launchpad/[id]/send-tx
 *
 * Broadcasts a fully-signed transaction to Solana using the server-side RPC.
 * This avoids exposing any RPC key client-side (no NEXT_PUBLIC_SOLANA_RPC_URL needed).
 *
 * Body: { signedTransactionBase64: string }
 * Response: { signature: string }
 */
import { SystemInstruction, SystemProgram } from "@solana/web3.js";
import { platformPubkey } from "@/lib/solana/dbc";
import { NextResponse } from "next/server";
import { solanaConnection } from "@/lib/solana/rpc";
import { Connection, Transaction } from "@solana/web3.js";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";

type RouteParams = { params: Promise<{ id: string }> };

function getConnection(): Connection {
  const rpc = process.env.SOLANA_RPC_URL;
  if (!rpc) throw new Error("SOLANA_RPC_URL is not set");
  return solanaConnection();
}

export async function POST(req: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
    const sess = await requireWallet();
    if ("error" in sess) return sess.error;
    const body = await req.json() as { signedTransactionBase64?: string; walletAddress?: string };
    if (!body.signedTransactionBase64) {
      return NextResponse.json({ error: "signedTransactionBase64 is required" }, { status: 400 });
    }
    if (!body.walletAddress) {
      return NextResponse.json({ error: "walletAddress is required" }, { status: 400 });
    }

    // Verify caller is the token creator — prevents open RPC proxy abuse
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data: token } = await admin
      .from("launchpad_tokens")
      .select("creator_wallet, status, mint_address")
      .eq("id", id)
      .maybeSingle();

    if (!token) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }
    if (token.creator_wallet !== body.walletAddress || body.walletAddress !== sess.wallet) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (token.status !== "pending") {
      return NextResponse.json({ error: "Token is not pending" }, { status: 409 });
    }

    const connection = getConnection();
    const txBuffer   = Buffer.from(body.signedTransactionBase64, "base64");
    const tx         = Transaction.from(txBuffer);

    // Relais limité à la TX « a » (frais de création) : uniquement des virements de SOL du créateur vers la plateforme
    // (+ réglages de calcul ajoutés par les wallets). Ce n'est plus un relais ouvert pour n'importe quelle transaction.
    {
      const platform = platformPubkey().toBase58();
      const ok = tx.instructions.length > 0 && tx.instructions.every((ix) => {
        const prog = ix.programId.toBase58();
        if (prog === "ComputeBudget111111111111111111111111111111") return true;
        if (!ix.programId.equals(SystemProgram.programId)) return false;
        try {
          const t = SystemInstruction.decodeTransfer(ix);
          return t.fromPubkey.toBase58() === body.walletAddress && t.toPubkey.toBase58() === platform;
        } catch { return false; }
      });
      if (!ok) return NextResponse.json({ error: "Only the launch fee transaction can be sent here" }, { status: 400 });
    }

    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight:       true, // tx pre-verified by SDK; preflight can reject valid txs under RPC lag
      preflightCommitment: "confirmed",
    });

    return NextResponse.json({ signature });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("send-tx error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
