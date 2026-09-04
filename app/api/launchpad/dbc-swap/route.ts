/**
 * POST /api/launchpad/dbc-swap
 *
 * Builds a Meteora DBC swap transaction server-side (buy OR sell).
 *
 * Body: { poolAddress, mintAddress, walletAddress, amountIn, slippageBps, swapBaseForQuote }
 *   swapBaseForQuote: false = buy  (SOL → token),  amountIn in lamports
 *   swapBaseForQuote: true  = sell (token → SOL),  amountIn in raw token units
 *
 * Response: { txBase64, estimatedOut, amountIn } | { error }
 *   Buy:  estimatedOut = raw token units
 *   Sell: estimatedOut = lamports
 */

import { NextResponse } from "next/server";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

function getConnection() {
  return new Connection(RPC_URL, "confirmed");
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      poolAddress?:      string;
      mintAddress?:      string;
      walletAddress?:    string;
      amountIn?:         number;   // lamports (buy) OR raw token units (sell)
      slippageBps?:      number;
      swapBaseForQuote?: boolean;  // false = buy, true = sell
    };

    const {
      poolAddress,
      walletAddress,
      amountIn,
      slippageBps      = 100,
      swapBaseForQuote = false,
    } = body;

    if (!poolAddress || !walletAddress || !amountIn || amountIn <= 0) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // ── Load DBC SDK ─────────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let DynamicBondingCurveClient: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let BN: any;
    try {
      const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
      DynamicBondingCurveClient = sdk.DynamicBondingCurveClient;
      const bnMod = await import("bn.js");
      BN = bnMod.default ?? bnMod;
    } catch {
      return NextResponse.json({ error: "DBC SDK not installed" }, { status: 500 });
    }

    const connection = getConnection();
    const client     = new DynamicBondingCurveClient(connection, "confirmed");
    const pool       = new PublicKey(poolAddress);
    const user       = new PublicKey(walletAddress);
    const amountInBN = new BN(amountIn);

    // ── Quote estimation via SDK ─────────────────────────────────────────────
    let estimatedOut     = 0;
    let minimumAmountOut = new BN(0);

    try {
      const virtualPool = await client.state.getPool(pool);
      const config      = await client.state.getPoolConfig(virtualPool.poolState.config);

      const quote = client.pool.swapQuote({
        virtualPool,
        config,
        swapBaseForQuote,
        amountIn:                       amountInBN,
        slippageBps,
        hasReferral:                    false,
        currentPoint:                   null,
        eligibleForFirstSwapWithMinFee: false,
      });

      estimatedOut     = parseInt(quote.outputAmount.toString(), 10);
      minimumAmountOut = quote.minimumAmountOut ?? new BN(0);
    } catch (e) {
      console.warn("[dbc-swap] quote estimation failed:", e instanceof Error ? e.message : e);
    }

    // ── Build swap transaction ───────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let swapTx: any;
    try {
      swapTx = await client.pool.swap({
        owner:                user,
        pool,
        amountIn:             amountInBN,
        minimumAmountOut,
        swapBaseForQuote,
        referralTokenAccount: null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to build transaction";
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    // ── Attach blockhash and serialize ───────────────────────────────────────
    const { blockhash } = await connection.getLatestBlockhash("confirmed");

    const isLegacy = "instructions" in swapTx && Array.isArray(swapTx.instructions);
    let serialized: Uint8Array;
    if (isLegacy) {
      swapTx.recentBlockhash = blockhash;
      swapTx.feePayer        = user;
      serialized = swapTx.serialize({ requireAllSignatures: false });
    } else {
      serialized = swapTx.serialize();
    }

    const txBase64 = Buffer.from(serialized).toString("base64");

    return NextResponse.json({
      txBase64,
      estimatedOut,
      amountIn,
      // helpers for display
      solIn:    swapBaseForQuote ? estimatedOut / LAMPORTS_PER_SOL : amountIn / LAMPORTS_PER_SOL,
      solOut:   swapBaseForQuote ? estimatedOut / LAMPORTS_PER_SOL : undefined,
    });

  } catch (err) {
    console.error("[dbc-swap] error:", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
