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

    // Try GeckoTerminal to get the pool's creator fee data
    try {
      // Resolve pool address via GeckoTerminal if needed
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
          // creator fee = creator_fee_percentage * 24h volume (approximation)
          // GeckoTerminal doesn't expose accumulated fees directly,
          // so we return the 24h fees earned as an approximation
          const volumeUsd24h = parseFloat(attrs?.volume_usd?.h24 ?? "0");
          // GeckoTerminal pool_fee is already a percentage string (e.g. "2.5" = 2.5%)
          // Some pools return it as a decimal fraction — we normalise both cases
          let feePct = parseFloat(attrs?.pool_fee ?? attrs?.swap_fee ?? "0");
          if (feePct > 0 && feePct < 1) feePct = feePct * 100; // 0.025 → 2.5
          // Creator gets 40% of fees per DBC config (platform feeClaimer gets 60%)
          const creatorSharePct = 0.4;
          const feesUsd24h = volumeUsd24h * (feePct / 100) * creatorSharePct;
          // We can't get the exact claimable SOL without on-chain data,
          // so return the 24h fee revenue in USD as context
          if (feesUsd24h > 0) {
            return NextResponse.json({ claimableSol: null, feesUsd24h: Number(feesUsd24h.toFixed(4)) });
          }
        }
      }
    } catch {
      // GeckoTerminal failed — fall through to SDK
    }

    // Fallback: try DBC SDK
    try {
      const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const DynamicBondingCurveClient = (sdk as any).DynamicBondingCurveClient;
      const connection = getConnection();
      const client     = new DynamicBondingCurveClient(connection, "confirmed");

      if (poolAddress) {
        const pool      = new PublicKey(poolAddress);
        const poolState = await client.state.getPool(pool);
        if (poolState) {
          const inner = poolState.poolState ?? poolState; // nested per DBC docs
          // tokenA = base (project token), tokenB = quote (SOL)
          const baseL  = Number(inner?.creatorTradingFeeTokenA ?? inner?.creator_trading_fee_token_a ?? 0);
          const quoteL = Number(inner?.creatorTradingFeeTokenB ?? inner?.creator_trading_fee_token_b ?? 0);
          if (baseL > 0 || quoteL > 0) {
            return NextResponse.json({ claimableSol: quoteL / 1e9, claimableBaseUnits: baseL });
          }
        }
      }
    } catch { /* SDK not available or method not found */ }

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

      maxBaseAmount  = new BN(String(inner?.creatorTradingFeeTokenA ?? inner?.creator_trading_fee_token_a  ?? 0));
      maxQuoteAmount = new BN(String(inner?.creatorTradingFeeTokenB ?? inner?.creator_trading_fee_token_b  ?? 0));

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
