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
      const virtualPool = await client.state.getPool(pool);  // { poolState: {...} }
      const config = await client.state.getPoolConfig(virtualPool.poolState.config);

      // Use SDK's swapQuote for accurate estimate
      const quote = client.pool.swapQuote({
        virtualPool,                    // pass full { poolState } wrapper
        config,
        swapBaseForQuote:               false, // SOL → token
        amountIn:                       new BN(lamports),
        slippageBps,
        hasReferral:                    false,
        currentPoint:                   null,
        eligibleForFirstSwapWithMinFee: false,
      });

      // Use string → BigInt to avoid 53-bit precision loss on large token amounts
      estimatedOut    = parseInt(quote.outputAmount.toString(), 10);
      minimumAmountOut = quote.minimumAmountOut ?? new BN(0);
    } catch (e) {
      console.warn("[dbc-swap] quote estimation failed:", e instanceof Error ? e.message : e);
      // Continue — swap will execute at market price with no slippage guard
    }

    // ── Build buy transaction ────────────────────────────────────────────────
    // SDK method: client.swap({ owner, pool, amountIn, minimumAmountOut, swapBaseForQuote, referralTokenAccount })
    // swapBaseForQuote: false = buy token with SOL (quote → base)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let buyTx: any;
    try {
      buyTx = await client.pool.swap({
        owner:                buyer,
        pool,
        amountIn:             new BN(lamports),
        minimumAmountOut,
        swapBaseForQuote:     false, // false = SOL → token (buy)
        referralTokenAccount: null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to build buy transaction";
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    // ── Attach blockhash and serialize ───────────────────────────────────────
    const { blockhash } = await connection.getLatestBlockhash("confirmed");

    // Detect transaction type:
    // - Legacy Transaction: has .instructions[] directly on the object
    // - VersionedTransaction: has .message with compiled instructions
    const isLegacy = "instructions" in buyTx && Array.isArray(buyTx.instructions);

    let serialized: Uint8Array;
    if (isLegacy) {
      buyTx.recentBlockhash = blockhash;
      buyTx.feePayer        = buyer;
      serialized = buyTx.serialize({ requireAllSignatures: false });
    } else {
      // VersionedTransaction — SDK sets blockhash internally; serialize as-is
      serialized = buyTx.serialize();
    }

    const txBase64 = Buffer.from(serialized).toString("base64");

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
