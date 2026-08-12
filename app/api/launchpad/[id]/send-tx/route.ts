/**
 * POST /api/launchpad/[id]/send-tx
 *
 * Broadcasts a fully-signed transaction to Solana using the server-side RPC.
 * This avoids exposing any RPC key client-side (no NEXT_PUBLIC_SOLANA_RPC_URL needed).
 *
 * Body: { signedTransactionBase64: string }
 * Response: { signature: string }
 */
import { NextResponse } from "next/server";
import { Connection, Transaction } from "@solana/web3.js";
import { createAdminClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

function getConnection(): Connection {
  const rpc = process.env.SOLANA_RPC_URL;
  if (!rpc) throw new Error("SOLANA_RPC_URL is not set");
  return new Connection(rpc, "confirmed");
}

export async function POST(req: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
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
    if (token.creator_wallet !== body.walletAddress) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (token.status !== "pending") {
      return NextResponse.json({ error: "Token is not pending" }, { status: 409 });
    }

    const connection = getConnection();
    const txBuffer   = Buffer.from(body.signedTransactionBase64, "base64");
    const tx         = Transaction.from(txBuffer);

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
