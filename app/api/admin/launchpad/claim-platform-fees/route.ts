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
import BN from "bn.js";
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
  reason?: string;
};

/** Message lisible à partir d'une erreur Solana (sans les logs bruts). */
function shortError(msg: string): string {
  const m = msg.match(/Error Message: ([^."]+)/) ?? msg.match(/custom program error: (0x[0-9a-f]+)/i);
  if (m) return m[1].trim();
  return msg.length > 160 ? msg.slice(0, 160) + "…" : msg;
}

async function claimForPool(
  client: unknown,
  connection: Connection,
  platformWallet: Keypair,
  token: TokenRow,
): Promise<ClaimResult> {
  const pool = new PublicKey(token.pool_address);

  // Fetch pool state — REQUIRED before building tx.
  // Per DBC SDK docs: poolState.poolState is the nested structure.
  // tokenA = base (project token), tokenB = quote (SOL).
  // Block if 0 fees in both buckets to prevent SDK drawing from payer.
  let claimedSol: number;
  let maxBaseAmount: BN;
  let maxQuoteAmount: BN;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const poolState = await (client as any).state.getPool(pool);
    if (!poolState) throw new Error("Pool not found");
    const inner = poolState.poolState ?? poolState; // handle both SDK versions

    // Real field names from DBC SDK (confirmed via debug endpoint):
    //   partnerBaseFee  = base token fees (hex string)
    //   partnerQuoteFee = SOL fees (hex string)
    const rawBase  = inner?.partnerBaseFee  ?? "0";
    const rawQuote = inner?.partnerQuoteFee ?? "0";
    maxBaseAmount  = new BN(rawBase  === "00" || rawBase  === "0" ? "0" : rawBase,  "hex");
    maxQuoteAmount = new BN(rawQuote === "00" || rawQuote === "0" ? "0" : rawQuote, "hex");

    if (maxBaseAmount.isZero() && maxQuoteAmount.isZero()) {
      return { tokenId: token.id, name: token.name, status: "skipped", claimedSol: 0 };
    }

    // Seul le « fee claimer » du config DBC du pool peut réclamer (sinon erreur 6053 Unauthorized).
    // Certains pools (anciens configs, configs créés par token) ont un autre claimer : on les saute.
    const configKey = inner?.config;
    if (configKey) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cfg = await (client as any).state.getPoolConfig(configKey);
      const claimer: string | undefined =
        cfg?.feeClaimer?.toBase58?.() ?? cfg?.partnerAddress?.toBase58?.() ?? undefined;
      if (claimer && claimer !== platformWallet.publicKey.toBase58()) {
        return {
          tokenId: token.id, name: token.name, status: "skipped", claimedSol: 0,
          reason: `fee claimer of this pool is ${claimer.slice(0, 4)}…${claimer.slice(-4)}, not the platform wallet`,
        };
      }
    }
    // claimedSol = SOL (quote) portion
    claimedSol = maxQuoteAmount.toNumber() / 1e9;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not fetch pool state";
    return { tokenId: token.id, name: token.name, status: "error", error: `Pool state check failed: ${msg}` };
  }

  // Per Meteora docs, claimPartnerTradingFeeToReceiver takes:
  //   { pool, feeClaimer, payer, maxBaseAmount, maxQuoteAmount, receiver }
  // maxBaseAmount / maxQuoteAmount = how much to claim per token; passing pool state
  // values claims exactly what is accumulated — no risk of drawing from payer.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let claimTx: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = client as any;
    const baseParams = {
      feeClaimer:     platformWallet.publicKey,
      payer:          platformWallet.publicKey,
      pool,
      receiver:       platformWallet.publicKey,
      maxBaseAmount,
      maxQuoteAmount,
    };
    if (c.partner?.claimPartnerTradingFeeToReceiver) {
      claimTx = await c.partner.claimPartnerTradingFeeToReceiver(baseParams);
    } else if (c.partner?.claimPartnerTradingFee) {
      claimTx = await c.partner.claimPartnerTradingFee(baseParams);
    } else {
      throw new Error("No partner fee claim method found in DBC SDK");
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
    console.error(`[claim-platform-fees] ${token.name}:`, msg);
    return { tokenId: token.id, name: token.name, status: "error", error: shortError(msg) };
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
    .eq("chain", "solana")
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
  const notOurs  = results.filter(r => r.status === "skipped" && r.reason).length;
  const errors   = results.filter(r => r.status === "error").length;
  const totalSol = results.reduce((s, r) => s + (r.claimedSol ?? 0), 0);

  return NextResponse.json({
    results,
    summary: { claimed, skipped, notOurs, errors, totalSol: Number(totalSol.toFixed(6)) },
  });
}
