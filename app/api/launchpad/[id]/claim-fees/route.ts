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
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
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
          const volumeUsd24h  = parseFloat(attrs?.volume_usd?.h24 ?? "0");
          const feePct        = parseFloat(attrs?.pool_fee ?? attrs?.swap_fee ?? "0"); // %
          const feesUsd24h    = volumeUsd24h * feePct / 100;
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
        const poolState = await client.getPool(pool);
        const lamports  = Number(
          poolState?.creatorTradingFeeTokenA ??
          poolState?.creator_trading_fee_token_a ??
          0
        );
        if (lamports > 0) return NextResponse.json({ claimableSol: lamports / 1e9 });
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

    const connection     = getConnection();
    const platformWallet = getPlatformWallet();
    const client         = new DynamicBondingCurveClient(connection, "confirmed");
    const creator        = new PublicKey(token.creator_wallet as string);
    const pool           = new PublicKey(token.pool_address as string);

    // Fetch pool state to get claimable fee amounts
    let claimableSol: number | null = null;
    try {
      const poolState = await client.getPool(pool);
      // creatorTradingFeeTokenA is usually the SOL/WSOL fee
      const lamports = Number(
        poolState?.creatorTradingFeeTokenA ??
        poolState?.creator_trading_fee_token_a ??
        0
      );
      claimableSol = lamports / 1e9;
    } catch {
      // Non-fatal — we proceed without the amount
    }

    // Build claim transaction
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let claimTx: any;
    try {
      claimTx = await client.creator.claimCreatorTradingFee({
        creator,
        pool,
        payer: platformWallet.publicKey,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to build claim transaction";
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    // Pre-sign with platform wallet (payer for fees)
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    claimTx.recentBlockhash = blockhash;
    claimTx.feePayer = platformWallet.publicKey;
    claimTx.partialSign(platformWallet);

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
