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
import { verifyTransaction } from "@/lib/solana/verify-tx";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * After the DBC createPool tx is confirmed, parse the transaction's account
 * list to find the newly-created pool PDA and return its address.
 *
 * Strategy:
 *  1. Fetch the confirmed transaction
 *  2. Find accounts whose preBalance was 0 and postBalance > 0 (newly created)
 *  3. Exclude the base mint and creator wallet (both already known)
 *  4. Test each candidate via DBC SDK getPool() — the real pool will return a valid state
 */
async function extractPoolAddress(
  txSig: string,
  mintAddress: string,
  creatorWallet: string,
): Promise<string | null> {
  try {
    const rpc = process.env.SOLANA_RPC_URL;
    if (!rpc) return null;

    const connection = new Connection(rpc, "confirmed");

    const txData = await connection.getTransaction(txSig, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });

    if (!txData?.meta) return null;

    const msg = txData.transaction.message;

    // Works for both legacy (Message) and versioned (MessageV0) transactions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawKeys: string[] = "getAccountKeys" in msg
      ? (msg as any).getAccountKeys().staticAccountKeys.map((k: PublicKey) => k.toBase58())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : (msg as any).accountKeys.map((k: any) => k.toBase58?.() ?? String(k));

    const preBalances  = txData.meta.preBalances;
    const postBalances = txData.meta.postBalances;
    const excluded     = new Set([mintAddress, creatorWallet]);

    // Newly-created rent-exempt accounts (not the mint, not the creator)
    const candidates = rawKeys.filter(
      (addr, i) => preBalances[i] === 0 && postBalances[i] > 0 && !excluded.has(addr),
    );

    if (candidates.length === 0) return null;

    // Identify the pool by probing each candidate with the DBC SDK
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const DynamicBondingCurveClient = (sdk as any).DynamicBondingCurveClient;
      const client = new DynamicBondingCurveClient(connection, "confirmed");

      for (const addr of candidates) {
        try {
          const poolState = await client.state.getPool(new PublicKey(addr));
          if (poolState) return addr;
        } catch { /* not a pool account — try next */ }
      }
    } catch { /* DBC SDK unavailable */ }

    return null;
  } catch {
    return null;
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
      .select("status, creator_wallet, is_scheduled, scheduled_at, mint_address")
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

    // Verify the transaction on-chain — distinguish confirmed / pending / failed
    let result = await verifyTransaction(body.txSignature);

    // If pending, retry once after a short delay (network propagation lag)
    if (result.state === "pending") {
      await new Promise(r => setTimeout(r, 4000));
      result = await verifyTransaction(body.txSignature);
    }

    // Transaction landed but reverted — do NOT mark token active, let user retry
    if (result.state === "failed") {
      console.error(`tx ${body.txSignature} failed on-chain for token ${id}:`, result.reason);
      return NextResponse.json(
        { error: `Transaction failed on-chain: ${result.reason}` },
        { status: 422 }
      );
    }

    const isConfirmed = result.state === "confirmed";
    if (!isConfirmed) {
      // TX still pending on-chain after 8s — do NOT accept optimistically.
      // Return a retriable error so the user can try again in a moment.
      // The token stays "pending" in DB; the blockhash is still valid ~52s.
      console.warn(`tx ${body.txSignature} not yet confirmed for token ${id} after retries`);
      return NextResponse.json(
        { error: "Transaction not yet confirmed. Please wait a few seconds and click Retry." },
        { status: 202 },
      );
    }

    // Scheduled tokens stay non-tradeable until scheduled_at
    const isScheduled = token.is_scheduled as boolean;
    const isTradeable = !isScheduled;
    const newStatus   = "active" as const;

    // Extract pool_address from the confirmed transaction before responding
    // Non-fatal: if extraction fails, pool_address stays null and can be fixed via admin
    let poolAddress: string | null = null;
    if (isConfirmed && token.mint_address) {
      poolAddress = await extractPoolAddress(
        body.txSignature,
        token.mint_address as string,
        body.walletAddress,
      );
    }

    await admin
      .from("launchpad_tokens")
      .update({
        status:       newStatus,
        is_tradeable: isTradeable,
        // Clear cached transaction so prepare-tx builds a fresh one if user re-launches
        tx_base64:      null,
        tx_prepared_at: null,
        // Only clear the mint secret if tx is confirmed on-chain; keep it for retry otherwise
        ...(isConfirmed ? { vanity_secret_key: null } : {}),
        // Store pool_address if we could extract it from the tx
        ...(poolAddress ? { pool_address: poolAddress } : {}),
      })
      .eq("id", id);

    return NextResponse.json({
      ok:          true,
      status:      newStatus,
      isTradeable,
      scheduledAt: isScheduled ? (token.scheduled_at as string) : null,
      poolAddress,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("confirm error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
