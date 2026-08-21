/**
 * POST /api/launchpad/[id]/claim-fees
 *
 * Builds the creator trading-fee claim transaction for the DBC pool.
 * The client wallet (creator) signs and submits it.
 *
 * Body: { walletAddress: string }
 * Returns: { transactionBase64: string; claimableSol: number | null }
 */
import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { createAdminClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

/** Convert a BN object, number, or decimal string → lamports (number) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bnToNumber(raw: any): number {
  if (!raw) return 0;
  if (typeof raw === "number") return raw;
  if (typeof raw.toNumber === "function") return raw.toNumber(); // BN object
  const str = String(raw).trim();
  if (!str || str === "0" || str === "00") return 0;
  return parseInt(str, 10); // decimal string
}

/** Convert a BN object, number, or decimal string → BN */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rawToBN(raw: any): BN {
  if (!raw) return new BN(0);
  if (raw instanceof BN) return raw;
  if (typeof raw === "number") return new BN(raw);
  if (typeof raw.toNumber === "function") return new BN(raw.toNumber()); // BN-like
  const str = String(raw).trim();
  if (!str || str === "0" || str === "00") return new BN(0);
  return new BN(str); // decimal string
}

function getConnection(): Connection {
  const rpc = process.env.SOLANA_RPC_URL;
  if (!rpc) throw new Error("SOLANA_RPC_URL is not set");
  return new Connection(rpc, "confirmed");
}


export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data: token, error } = await admin
      .from("launchpad_tokens")
      .select("pool_address, mint_address")
      .eq("id", id)
      .maybeSingle();

    if (error || !token) return NextResponse.json({ claimableSol: null });

    const poolAddress = token.pool_address as string | null;
    const mintAddress = token.mint_address as string | null;

    if (!poolAddress && !mintAddress) return NextResponse.json({ claimableSol: null });

    // 1. Try DBC SDK first — exact on-chain amount
    if (poolAddress) {
      try {
        const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const DynamicBondingCurveClient = (sdk as any).DynamicBondingCurveClient;
        const connection = getConnection();
        const client     = new DynamicBondingCurveClient(connection, "confirmed");
        const pool       = new PublicKey(poolAddress);
        const poolState  = await client.state.getPool(pool);
        if (poolState) {
          const inner  = poolState.poolState ?? poolState;
          const rawQ   = inner?.creatorQuoteFee;
          const rawB   = inner?.creatorBaseFee;
          const quoteL = bnToNumber(rawQ);
          const baseL  = bnToNumber(rawB);
          // Always return the SDK value — even if 0 (so UI shows 0, not a GeckoTerminal estimate)
          return NextResponse.json({ claimableSol: quoteL / 1e9, claimableBaseUnits: baseL });
        }
      } catch { /* SDK failed — fall through to GeckoTerminal */ }
    }

    // 2. Fallback: GeckoTerminal 24h fee estimate (approximate, USD only)
    try {
      let gtPool = poolAddress;
      if (!gtPool && mintAddress) {
        const res = await fetch(
          `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mintAddress}/pools?page=1`,
          { headers: { Accept: "application/json" } }
        );
        if (res.ok) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const json = await res.json() as any;
          gtPool = json?.data?.[0]?.attributes?.address ?? null;
        }
      }
      if (gtPool) {
        const res = await fetch(
          `https://api.geckoterminal.com/api/v2/networks/solana/pools/${gtPool}`,
          { headers: { Accept: "application/json" } }
        );
        if (res.ok) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const json = await res.json() as any;
          const attrs = json?.data?.attributes;
          const volumeUsd24h = parseFloat(attrs?.volume_usd?.h24 ?? "0");
          let feePct = parseFloat(attrs?.pool_fee ?? attrs?.swap_fee ?? "0");
          if (feePct > 0 && feePct < 1) feePct = feePct * 100;
          // Creator gets 1% out of 3% total fee (1/3 of pool fees)
          const feesUsd24h = volumeUsd24h * (feePct / 100) * (1 / 3);
          if (feesUsd24h > 0) {
            return NextResponse.json({ claimableSol: null, feesUsd24h: Number(feesUsd24h.toFixed(4)) });
          }
        }
      }
    } catch { /* GeckoTerminal failed */ }

    return NextResponse.json({ claimableSol: null, feesUsd24h: null });
  } catch (err) {
    console.error("claimable-fees GET error:", err);
    return NextResponse.json({ claimableSol: null, feesUsd24h: null });
  }
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
      .select("id, creator_wallet, status, pool_address, mint_address")
      .eq("id", id)
      .maybeSingle();

    if (error || !token) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }
    if ((token.creator_wallet as string) !== body.walletAddress) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (!token.pool_address) {
      return NextResponse.json({ error: "No pool address — token not yet launched" }, { status: 409 });
    }

    // Load DBC SDK
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let DynamicBondingCurveClient: any;
    try {
      const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
      DynamicBondingCurveClient = sdk.DynamicBondingCurveClient;
    } catch {
      return NextResponse.json({ error: "DBC SDK not installed" }, { status: 500 });
    }

    const connection = getConnection();
    const client     = new DynamicBondingCurveClient(connection, "confirmed");
    const creator    = new PublicKey(token.creator_wallet as string);
    const pool       = new PublicKey(token.pool_address as string);

    // Fetch pool state — required before building the tx.
    // poolState.poolState is the nested structure per DBC SDK docs.
    // tokenA = base (project token fees), tokenB = quote (SOL fees).
    // Block if both are 0 to prevent the SDK from drawing from the payer.
    let claimableSol: number;
    let maxBaseAmount: BN;
    let maxQuoteAmount: BN;
    try {
      const poolState = await client.state.getPool(pool);
      if (!poolState) throw new Error("Pool not found");
      const inner = poolState.poolState ?? poolState; // handle both SDK versions

      // creatorBaseFee / creatorQuoteFee can be BN objects, numbers, or decimal strings
      const rawBase  = inner?.creatorBaseFee;
      const rawQuote = inner?.creatorQuoteFee;
      maxBaseAmount  = rawToBN(rawBase);
      maxQuoteAmount = rawToBN(rawQuote);

      if (maxBaseAmount.isZero() && maxQuoteAmount.isZero()) {
        return NextResponse.json(
          { error: "Nothing to claim — no fees accumulated in this pool yet" },
          { status: 409 }
        );
      }
      // claimableSol = SOL (quote) portion
      claimableSol = maxQuoteAmount.toNumber() / 1e9;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown";
      return NextResponse.json(
        { error: `Could not fetch pool state: ${msg}` },
        { status: 503 }
      );
    }

    // Per Meteora docs, claimCreatorTradingFeeToReceiver takes:
    //   { creator, pool, payer, maxBaseAmount, maxQuoteAmount, receiver }
    // Platform wallet is NOT involved in this transaction.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let claimTx: any;
    try {
      claimTx = await client.creator.claimCreatorTradingFeeToReceiver({
        creator,
        pool,
        payer:          creator, // creator pays their own gas
        receiver:       creator, // claimed SOL goes to creator
        maxBaseAmount,
        maxQuoteAmount,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to build claim transaction";
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    claimTx.recentBlockhash = blockhash;
    claimTx.feePayer = creator;

    const transactionBase64 = Buffer.from(
      claimTx.serialize({ requireAllSignatures: false })
    ).toString("base64");

    return NextResponse.json({ transactionBase64, claimableSol });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("claim-fees error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
