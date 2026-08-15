/**
 * POST /api/admin/launchpad/claim-platform-fees
 *
 * Claims the platform (partner) share of trading fees from DBC pools.
 * Entirely server-side — signed by PLATFORM_WALLET_SECRET.
 * No user wallet required.
 *
 * Body (optional):
 *   { tokenId?: string }   — omit to claim all pools with a pool_address
 *
 * Response:
 *   { results: Array<{ tokenId, name, status, signature?, error? }> }
 */
import { NextResponse } from "next/server";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/server";

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

type TokenRow = {
  id: string;
  name: string;
  ticker: string;
  pool_address: string;
};

type ClaimResult = {
  tokenId: string;
  name: string;
  status: "ok" | "skipped" | "error";
  signature?: string;
  claimedSol?: number;
  error?: string;
};

async function claimForPool(
  client: unknown,
  connection: Connection,
  platformWallet: Keypair,
  token: TokenRow,
): Promise<ClaimResult> {
  const pool = new PublicKey(token.pool_address);

  // Check claimable amount first (non-fatal)
  let claimedSol: number | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const poolState = await (client as any).getPool(pool);
    const lamports = Number(
      poolState?.partnerTradingFeeTokenA ??
      poolState?.partner_trading_fee_token_a ??
      poolState?.protocolTradingFeeTokenA ??
      poolState?.protocol_trading_fee_token_a ??
      0
    );
    if (lamports === 0) {
      return { tokenId: token.id, name: token.name, status: "skipped", claimedSol: 0 };
    }
    claimedSol = lamports / 1e9;
  } catch {
    // Non-fatal — proceed without amount check
  }

  // Build claim tx (try partner, then protocol as fallback)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let claimTx: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = client as any;
    if (c.partner?.claimPartnerTradingFee) {
      claimTx = await c.partner.claimPartnerTradingFee({
        payer: platformWallet.publicKey,
        pool,
      });
    } else if (c.partner?.claimTradingFee) {
      claimTx = await c.partner.claimTradingFee({
        payer: platformWallet.publicKey,
        pool,
      });
    } else if (c.claimPartnerFee) {
      claimTx = await c.claimPartnerFee({
        payer: platformWallet.publicKey,
        pool,
      });
    } else if (c.claimProtocolFee) {
      claimTx = await c.claimProtocolFee({
        payer: platformWallet.publicKey,
        pool,
      });
    } else {
      throw new Error("No partner/protocol fee claim method found in DBC SDK");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to build claim tx";
    return { tokenId: token.id, name: token.name, status: "error", error: msg };
  }

  // Sign and send
  try {
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    claimTx.recentBlockhash = blockhash;
    claimTx.feePayer = platformWallet.publicKey;
    claimTx.sign(platformWallet);

    const sig = await connection.sendRawTransaction(claimTx.serialize(), {
      maxRetries: 3,
      skipPreflight: false,
    });

    await connection.confirmTransaction(sig, "confirmed");

    return {
      tokenId: token.id,
      name: token.name,
      status: "ok",
      signature: sig,
      claimedSol,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Transaction failed";
    return { tokenId: token.id, name: token.name, status: "error", error: msg };
  }
}

export async function POST(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  let body: { tokenId?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine — claim all
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Fetch target tokens
  let query = admin
    .from("launchpad_tokens")
    .select("id, name, ticker, pool_address")
    .not("pool_address", "is", null)
    .in("status", ["active", "graduating", "graduated"]);

  if (body.tokenId) {
    query = query.eq("id", body.tokenId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const tokens: TokenRow[] = (data ?? []).filter((t: TokenRow) => t.pool_address);

  if (tokens.length === 0) {
    return NextResponse.json({ results: [], message: "No pools to claim from" });
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

  // Process sequentially to avoid RPC rate-limits
  const results: ClaimResult[] = [];
  for (const token of tokens) {
    const result = await claimForPool(client, connection, platformWallet, token);
    results.push(result);
  }

  const claimed  = results.filter(r => r.status === "ok").length;
  const skipped  = results.filter(r => r.status === "skipped").length;
  const errors   = results.filter(r => r.status === "error").length;
  const totalSol = results.reduce((s, r) => s + (r.claimedSol ?? 0), 0);

  return NextResponse.json({
    results,
    summary: { claimed, skipped, errors, totalSol: Number(totalSol.toFixed(6)) },
  });
}
