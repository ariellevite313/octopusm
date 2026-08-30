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
import { Connection, PublicKey } from "@solana/web3.js";
import { createAdminClient } from "@/lib/supabase/server";

export type PendingFeeToken = {
  tokenId:     string;
  name:        string;
  ticker:      string;
  logoUrl:     string | null;
  pending:     number;          // SOL (quote fees)
  poolAddress: string;
};

export type PendingFeesResponse = {
  total:  number;
  tokens: PendingFeeToken[];
};

function getConnection(): Connection {
  const rpc = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
  return new Connection(rpc, "confirmed");
}

async function queryPendingSol(poolAddress: string): Promise<number> {
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
      lamports = rawQ.toNumber(); // BN
    } else if (typeof rawQ === "number") {
      lamports = rawQ;
    } else {
      const str = String(rawQ).trim();
      if (str === "0" || str === "00" || str === "") return 0;
      lamports = parseInt(str, 10); // decimal string (BN.toString())
    }

    return lamports / 1e9;
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

  const { data: tokenRows } = await admin
    .from("launchpad_tokens")
    .select("id, name, ticker, logo_url, pool_address")
    .eq("creator_wallet", wallet)
    .in("status", ["active", "graduating", "graduated"]);
  // Note: tokens without pool_address are included — they show 0 pending

  if (!tokenRows || tokenRows.length === 0) {
    return NextResponse.json({ total: 0, tokens: [] } satisfies PendingFeesResponse);
  }

  type TokenRow = { id: string; name: string; ticker: string; logo_url: string | null; pool_address: string | null };

  const withTimeout = (p: Promise<number>, ms = 6000) =>
    Promise.race([p, new Promise<number>(res => setTimeout(() => res(0), ms))]);

  // Fan out RPC calls in parallel (each capped at 6 s)
  // Tokens without a pool_address yet get pending = 0 immediately
  const results = await Promise.all(
    (tokenRows as TokenRow[]).map(async (t) => {
      const pending = t.pool_address
        ? await withTimeout(queryPendingSol(t.pool_address))
        : 0;
      return {
        tokenId:     t.id,
        name:        t.name,
        ticker:      t.ticker,
        logoUrl:     t.logo_url,
        pending,
        poolAddress: t.pool_address ?? "",
      } satisfies PendingFeeToken;
    })
  );

  // Only return tokens with pending > 0 (or all, so UI shows zeros too)
  const tokens = results.sort((a, b) => b.pending - a.pending);
  const total  = tokens.reduce((s, t) => s + t.pending, 0);

  return NextResponse.json({ total, tokens } satisfies PendingFeesResponse);
}
