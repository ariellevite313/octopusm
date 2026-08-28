/**
 * POST /api/launchpad/[id]/prepare-fee-tx
 *
 * Builds a simple SOL transfer transaction:
 *   creator → platform wallet
 *   amount  = 0.05 SOL (+ 0.10 SOL if scheduled)
 *
 * This is sent as a separate tx before pool creation so Phantom
 * doesn't flag the pool tx as suspicious (drainer pattern).
 */
import { NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import bs58 from "bs58";
import { createAdminClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

function getConnection(): Connection {
  const rpc = process.env.SOLANA_RPC_URL;
  if (!rpc) throw new Error("SOLANA_RPC_URL is not set");
  return new Connection(rpc, "confirmed");
}

function getPlatformWallet(): Keypair {
  const secret = process.env.PLATFORM_WALLET_SECRET;
  if (!secret) throw new Error("PLATFORM_WALLET_SECRET is not set");
  return Keypair.fromSecretKey(bs58.decode(secret));
}

export async function POST(req: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
    const body = await req.json() as { walletAddress?: string };
    if (!body.walletAddress) {
      return NextResponse.json({ error: "walletAddress is required" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data: token, error } = await admin
      .from("launchpad_tokens")
      .select("id, creator_wallet, status, is_scheduled")
      .eq("id", id)
      .maybeSingle();

    if (error || !token) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }
    if (token.creator_wallet !== body.walletAddress) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (token.status !== "pending") {
      return NextResponse.json({ error: `Token is already ${token.status as string}` }, { status: 409 });
    }

    // If fee was already paid in the last 30 min, skip TX1 so the user
    // doesn't pay twice when retrying after rejecting TX2.
    // (fee_paid_at column may not exist yet — handled gracefully)
    try {
      const FEE_WINDOW_MS = 30 * 60 * 1000;
      const { data: feeRow } = await admin
        .from("launchpad_tokens")
        .select("fee_paid_at")
        .eq("id", id)
        .maybeSingle();
      if (feeRow?.fee_paid_at) {
        const paidAgo = Date.now() - new Date(feeRow.fee_paid_at as string).getTime();
        if (paidAgo < FEE_WINDOW_MS) {
          return NextResponse.json({ skip: true });
        }
      }
    } catch {
      // Column doesn't exist yet — skip the check, proceed normally
    }

    const connection     = getConnection();
    const platformWallet = getPlatformWallet();
    const creator        = new PublicKey(body.walletAddress);

    const CREATION_FEE_LAMPORTS  = Math.floor(0.05 * LAMPORTS_PER_SOL);
    const SCHEDULED_FEE_LAMPORTS = Math.floor(0.10 * LAMPORTS_PER_SOL);
    const totalLamports = CREATION_FEE_LAMPORTS + (token.is_scheduled ? SCHEDULED_FEE_LAMPORTS : 0);

    const { blockhash } = await connection.getLatestBlockhash("confirmed");

    const feeTx = new Transaction({
      recentBlockhash: blockhash,
      feePayer: creator,
    });

    feeTx.add(
      SystemProgram.transfer({
        fromPubkey: creator,
        toPubkey:   platformWallet.publicKey,
        lamports:   totalLamports,
      })
    );

    const serialized = feeTx.serialize({ requireAllSignatures: false });
    const transactionBase64 = Buffer.from(serialized).toString("base64");

    return NextResponse.json({ transactionBase64, totalSol: totalLamports / LAMPORTS_PER_SOL });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("prepare-fee-tx error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
