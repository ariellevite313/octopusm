/**
 * GET /api/dashboard/pending-fees?wallet=xxx
 *
 * For every active/graduated token owned by the wallet,
 * queries the DBC pool on-chain to get unclaimed SOL fees.
 * Uses Promise.all for parallel RPC calls.
 *
 * Returns: { total, tokens: [{ tokenId, name, ticker, logoUrl, pending, poolAddress }] }
 */
import { NextResponse } from "next/server";
import { solanaConnection } from "@/lib/solana/rpc";
import { Connection, PublicKey } from "@solana/web3.js";
import { createAdminClient } from "@/lib/supabase/server";
import { ensurePoolsForWallet } from "@/lib/launch/ensure-pool";
import { pairQuoteByMint } from "@/lib/solana/quotes";

export type PendingFeeToken = {
  tokenId:     string;
  name:        string;
  ticker:      string;
  logoUrl:     string | null;
  pending:     number;          // quote fees, in quoteSymbol (SOL by default)
  quoteSymbol?: string;
  poolAddress: string;
};

export type PendingFeesResponse = {
  total:  number;
  tokens: PendingFeeToken[];
};

function getConnection(): Connection {
  const rpc = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
  return solanaConnection();
}

async function queryPendingSol(poolAddress: string, decimals = 9): Promise<number> {
  try {
    const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DynamicBondingCurveClient = (sdk as any).DynamicBondingCurveClient;
    const connection = getConnection();
    const client     = new DynamicBondingCurveClient(connection, "confirmed");
    const pool       = new PublicKey(poolAddress);
    const poolState  = await client.state.getPool(pool);
    if (!poolState) return 0;
    const inner = poolState.poolState ?? poolState;
    const rawQ  = inner?.creatorQuoteFee;
    if (!rawQ) return 0;

    // creatorQuoteFee can be a BN object, a number, or a decimal string
    let lamports: number;
    if (typeof rawQ === "object" && rawQ !== null && typeof rawQ.toNumber === "function") {
      lamports = Number(rawQ.toString()); // BN (toNumber casse au-delà de 2^53)
    } else if (typeof rawQ === "number") {
      lamports = rawQ;
    } else {
      const str = String(rawQ).trim();
      if (str === "0" || str === "00" || str === "") return 0;
      lamports = parseInt(str, 10); // decimal string (BN.toString())
    }

    return lamports / 10 ** decimals;
  } catch (err) {
    console.warn("[pending-fees] queryPendingSol failed for", poolAddress, err);
    return 0;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet required" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Tokens restés « pending » alors que leur pool existe : activés d'abord, sinon leurs frais restent invisibles
  await ensurePoolsForWallet(admin, wallet).catch(() => []);

  const { data: tokenRows } = await admin
    .from("launchpad_tokens")
    .select("id, name, ticker, logo_url, pool_address, quote_asset")
    .eq("creator_wallet", wallet)
    .in("status", ["active", "graduating", "graduated"])
    // Arc tokens earn USDC fees claimed via ClaimFeesArc — exclude them here
    .or("chain.eq.solana,chain.is.null");

  if (!tokenRows || tokenRows.length === 0) {
    return NextResponse.json({ total: 0, tokens: [] } satisfies PendingFeesResponse);
  }

  type TokenRow = { id: string; name: string; ticker: string; logo_url: string | null; pool_address: string | null; quote_asset: string | null };

  const withTimeout = (p: Promise<number>, ms = 6000) =>
    Promise.race([p, new Promise<number>(res => setTimeout(() => res(0), ms))]);

  // Fan out RPC calls in parallel (each capped at 6 s)
  // Tokens without a pool_address yet get pending = 0 immediately
  const results = await Promise.all(
    (tokenRows as TokenRow[]).map(async (t) => {
      const pq = pairQuoteByMint(t.quote_asset);
      const pending = t.pool_address
        ? await withTimeout(queryPendingSol(t.pool_address, pq?.decimals ?? 9))
        : 0;
      return {
        tokenId:     t.id,
        name:        t.name,
        ticker:      t.ticker,
        logoUrl:     t.logo_url,
        pending,
        quoteSymbol: pq?.symbol ?? "SOL",
        poolAddress: t.pool_address ?? "",
      } satisfies PendingFeeToken;
    })
  );

  // Only return tokens with pending > 0 (or all, so UI shows zeros too)
  const tokens = results.sort((a, b) => b.pending - a.pending);
  // Le total est en SOL : les pools en DOGE, PEPE, CLT sont montrées à part, dans leur monnaie
  const total  = tokens.reduce((s, t) => s + ((t.quoteSymbol ?? "SOL") === "SOL" ? t.pending : 0), 0);

  return NextResponse.json({ total, tokens } satisfies PendingFeesResponse);
}
