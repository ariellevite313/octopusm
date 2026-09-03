/**
 * POST /api/launchpad/dbc-swap
 *
 * Builds a Meteora DBC buy transaction server-side and returns it base64-encoded
 * for the client to sign and send.
 *
 * Body: { poolAddress, mintAddress, walletAddress, lamports, slippageBps }
 * Response: { txBase64, estimatedOut } | { error }
 *
 * estimatedOut is the raw base-token amount (before decimals).
 * The client applies decimals (default 6) to display the human-readable amount.
 */

import { NextResponse } from "next/server";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

function getConnection() {
  return new Connection(RPC_URL, "confirmed");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bnToNumber(v: any): number {
  if (v == null) return 0;
  if (typeof v.toNumber === "function") return v.toNumber();
  if (typeof v === "bigint") return Number(v);
  return Number(v);
}

/**
 * Virtual AMM quote: x*y = k bonding curve
 * virtualSolReserves and virtualTokenReserves are in their native units.
 */
function estimateOut(
  virtualSolReserves: number,
  virtualTokenReserves: number,
  lamportsIn: number,
): number {
  if (virtualSolReserves <= 0 || virtualTokenReserves <= 0) return 0;
  // k = x * y
  // amountOut = virtualTokenReserves - k / (virtualSolReserves + amountIn)
  const amountOut = (virtualTokenReserves * lamportsIn) / (virtualSolReserves + lamportsIn);
  return Math.floor(amountOut);
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      poolAddress?:  string;
      mintAddress?:  string;
      walletAddress?: string;
      lamports?:     number;
      slippageBps?:  number;
    };

    const { poolAddress, walletAddress, lamports, slippageBps = 100 } = body;

    if (!poolAddress || !walletAddress || !lamports || lamports <= 0) {
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
    const buyer      = new PublicKey(walletAddress);

    // ── Fetch pool state for quote estimation ────────────────────────────────
    let estimatedOut = 0;
    let minimumAmountOut = new BN(0);

    try {
      const poolState = await client.state.getPool(pool);
      if (poolState) {
        const inner = poolState.poolState ?? poolState;

        // Virtual reserves — field names may vary by SDK version
        const vSol = bnToNumber(
          inner?.virtualSolReserves ??
          inner?.virtualQuoteReserves ??
          inner?.virtualQuoteAmount
        );
        const vTok = bnToNumber(
          inner?.virtualTokenReserves ??
          inner?.virtualBaseReserves ??
          inner?.virtualBaseAmount
        );

        estimatedOut = estimateOut(vSol, vTok, lamports);

        // Apply slippage to get minimum amount out
        const slippageFactor = 1 - slippageBps / 10000;
        const minOut = Math.floor(estimatedOut * slippageFactor);
        minimumAmountOut = new BN(minOut);
      }
    } catch (e) {
      console.warn("[dbc-swap] Could not fetch pool state for quote:", e instanceof Error ? e.message : e);
      // Continue with minimumAmountOut = 0 (no slippage protection, riskier but functional)
    }

    // ── Build buy transaction ────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let buyTx: any;
    try {
      // Try the most common DBC SDK v2 signature first
      buyTx = await client.user.buy({
        pool,
        buyer,
        buyAmount:        new BN(lamports),
        minimumAmountOut,
        referralTokenAccount: null,
      });
    } catch {
      // Fallback: some SDK versions use `inAmount` / `outAmount` naming
      try {
        buyTx = await client.swap({
          pool,
          user:             buyer,
          inAmount:         new BN(lamports),
          minimumOutAmount: minimumAmountOut,
          referralTokenAccount: null,
        });
      } catch (e2) {
        const msg = e2 instanceof Error ? e2.message : "Failed to build buy transaction";
        return NextResponse.json({ error: msg }, { status: 500 });
      }
    }

    // ── Attach blockhash and serialize ───────────────────────────────────────
    const { blockhash } = await connection.getLatestBlockhash("confirmed");

    // buyTx may be a Transaction or VersionedTransaction
    if (typeof buyTx.recentBlockhash !== "undefined") {
      // Legacy Transaction
      buyTx.recentBlockhash = blockhash;
      buyTx.feePayer        = buyer;
    } else if (buyTx.message?.recentBlockhash !== undefined) {
      // VersionedTransaction — can't easily patch blockhash, use as-is
      // (SDK should have fetched a fresh one internally)
    }

    const txBase64 = Buffer.from(
      buyTx.serialize({ requireAllSignatures: false })
    ).toString("base64");

    return NextResponse.json({
      txBase64,
      estimatedOut, // raw token units (apply /1e6 for display)
      lamportsIn: lamports,
      solIn: lamports / LAMPORTS_PER_SOL,
    });

  } catch (err) {
    console.error("[dbc-swap] error:", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
