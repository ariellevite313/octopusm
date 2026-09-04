/**
 * POST /api/launchpad/dbc-swap
 *
 * Builds a Meteora DBC swap transaction server-side (buy OR sell).
 *
 * Body: { poolAddress, mintAddress, walletAddress, amountIn, slippageBps, swapBaseForQuote }
 *   swapBaseForQuote: false = buy  (SOL → token),  amountIn in lamports (integer)
 *   swapBaseForQuote: true  = sell (token → SOL),  amountIn in raw token units (integer)
 *
 * Response: { txBase64, estimatedOut, amountIn } | { error }
 *   Buy:  estimatedOut = raw token units
 *   Sell: estimatedOut = lamports
 */

import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

function getConnection() {
  return new Connection(RPC_URL, "confirmed");
}

function tryPublicKey(str: string): PublicKey | null {
  try { return new PublicKey(str); } catch { return null; }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      poolAddress?:      string;
      mintAddress?:      string;
      walletAddress?:    string;
      amountIn?:         number;   // lamports (buy) OR raw token units (sell) — must be integer ≥ 1
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

    // ── Input validation ────────────────────────────────────────────────────────
    if (!poolAddress || !walletAddress || !amountIn) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // amountIn must be a positive integer (lamports or raw token units, never a float)
    if (!Number.isInteger(amountIn) || amountIn < 1) {
      return NextResponse.json(
        { error: "amountIn must be a positive integer (lamports or raw token units)" },
        { status: 400 },
      );
    }

    const poolPk = tryPublicKey(poolAddress);
    const userPk = tryPublicKey(walletAddress);
    if (!poolPk) return NextResponse.json({ error: "Invalid pool address" }, { status: 400 });
    if (!userPk) return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });

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

    const connection  = getConnection();
    const client      = new DynamicBondingCurveClient(connection, "confirmed");
    const amountInBN  = new BN(amountIn);

    // ── Quote estimation via SDK ─────────────────────────────────────────────
    let estimatedOut     = 0;
    let minimumAmountOut = new BN(0);

    try {
      const virtualPool = await client.state.getPool(poolPk);
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
        owner:                userPk,
        pool:                 poolPk,
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
      swapTx.feePayer        = userPk;
      serialized = swapTx.serialize({ requireAllSignatures: false });
    } else {
      serialized = swapTx.serialize();
    }

    const txBase64 = Buffer.from(serialized).toString("base64");

    return NextResponse.json({ txBase64, estimatedOut, amountIn });

  } catch (err) {
    console.error("[dbc-swap] error:", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
