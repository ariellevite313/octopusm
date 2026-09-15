/**
 * POST /api/launchpad/[id]/check-pool
 *
 * Checks on-chain whether the Meteora DBC virtual pool for this token's
 * mint already exists — without requiring a transaction signature.
 *
 * Called by the frontend after any TX B failure so we can recover from
 * the Phantom bug where it broadcasts successfully but fires an error
 * callback (leaving us without a signature).
 *
 * Strategy:
 *  1. Extract the DBC program ID from the cached TX B instructions
 *  2. Try known PDA seed combinations to derive the pool address
 *  3. getAccountInfo — if account exists, pool was created
 *  4. If found, mark token as active in DB
 */
import { NextResponse } from "next/server";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { createAdminClient } from "@/lib/supabase/server";
import { getXStockMint } from "@/lib/solana/xstocks";

type RouteParams = { params: Promise<{ id: string }> };

const BLOWFISH_SAFE = new Set([
  "11111111111111111111111111111111",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1Rd3",
  "SysvarRent111111111111111111111111111111111",
  "ComputeBudget111111111111111111111111111111",
]);

async function findPoolOnChain(
  connection: Connection,
  mintAddress: string,
  dbcProgramId: PublicKey,
  xStockConfigAddress?: string | null,  // dbc_config_address (xStock only)
  xStockSymbol?: string | null,          // stock_symbol (xStock only)
): Promise<string | null> {
  const baseMint  = new PublicKey(mintAddress);
  const solConfig = process.env.DBC_CONFIG_KEY ? new PublicKey(process.env.DBC_CONFIG_KEY) : null;

  const seedSets: Buffer[][] = [];

  // ── xStock pool: ["pool", configKey, sorted(quoteMint, baseMint)] ──────────
  // The DBC pool PDA canonical ordering: larger buffer key first.
  if (xStockConfigAddress && xStockSymbol) {
    const xStockMintStr = getXStockMint(xStockSymbol);
    if (xStockMintStr) {
      try {
        const xConfig  = new PublicKey(xStockConfigAddress);
        const quoteMint = new PublicKey(xStockMintStr);
        const isQuoteBigger = quoteMint.toBuffer().compare(baseMint.toBuffer()) > 0;
        seedSets.push([
          Buffer.from("pool"),
          xConfig.toBuffer(),
          isQuoteBigger ? quoteMint.toBuffer() : baseMint.toBuffer(),
          isQuoteBigger ? baseMint.toBuffer()  : quoteMint.toBuffer(),
        ]);
      } catch { /* invalid key — fall through */ }
    }
  }

  // ── SOL pool: ["pool", solConfig, sorted(SOL, baseMint)] and legacy variants ─
  if (solConfig) {
    const wsol = new PublicKey("So11111111111111111111111111111111111111112");
    const isWsolBigger = wsol.toBuffer().compare(baseMint.toBuffer()) > 0;
    seedSets.push([
      Buffer.from("pool"),
      solConfig.toBuffer(),
      isWsolBigger ? wsol.toBuffer()     : baseMint.toBuffer(),
      isWsolBigger ? baseMint.toBuffer() : wsol.toBuffer(),
    ]);
    // Legacy 3-seed variants (older SDK versions)
    seedSets.push([Buffer.from("virtual_pool"), solConfig.toBuffer(), baseMint.toBuffer()]);
    seedSets.push([Buffer.from("pool"),         solConfig.toBuffer(), baseMint.toBuffer()]);
  }
  // Legacy 2-seed fallbacks
  seedSets.push([Buffer.from("virtual_pool"), baseMint.toBuffer()]);
  seedSets.push([Buffer.from("pool"),         baseMint.toBuffer()]);

  for (const seeds of seedSets) {
    try {
      const [pda] = PublicKey.findProgramAddressSync(seeds, dbcProgramId);
      const info = await connection.getAccountInfo(pda);
      if (info !== null) {
        console.log("[check-pool] found pool at PDA:", pda.toBase58());
        return pda.toBase58();
      }
    } catch { /* try next */ }
  }
  return null;
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
    const { data: token } = await admin
      .from("launchpad_tokens")
      .select("status, creator_wallet, mint_address, tx_base64, is_scheduled, stock_symbol, dbc_config_address")
      .eq("id", id)
      .maybeSingle();

    if (!token) return NextResponse.json({ error: "Token not found" }, { status: 404 });
    if ((token.creator_wallet as string) !== body.walletAddress) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Already active — nothing to do
    if (token.status === "active" || token.status === "graduated") {
      return NextResponse.json({ found: true, alreadyActive: true });
    }

    if (!token.mint_address) {
      return NextResponse.json({ found: false, reason: "no mint address" });
    }

    const rpc = process.env.SOLANA_RPC_URL;
    if (!rpc) return NextResponse.json({ found: false, reason: "no RPC" });

    const connection = new Connection(rpc, "confirmed");

    // Extract DBC program ID from cached TX B instructions
    let dbcProgramId: PublicKey | null = null;
    if (token.tx_base64) {
      try {
        const cached = JSON.parse(token.tx_base64 as string) as { b?: string };
        if (cached.b) {
          const txB = Transaction.from(Buffer.from(cached.b, "base64"));
          const dbcIx = txB.instructions.find(
            ix => !BLOWFISH_SAFE.has(ix.programId.toBase58())
          );
          if (dbcIx) dbcProgramId = dbcIx.programId;
        }
      } catch { /* fallback to known IDs */ }
    }

    // Use extracted DBC program ID, falling back to the known one from logs
    const KNOWN_DBC_PROGRAM = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";
    const programsToTry: PublicKey[] = dbcProgramId
      ? [dbcProgramId, new PublicKey(KNOWN_DBC_PROGRAM)]
      : [new PublicKey(KNOWN_DBC_PROGRAM)];

    const xStockSymbol      = (token.stock_symbol     as string | null) ?? null;
    const xStockConfigAddr  = (token.dbc_config_address as string | null) ?? null;

    let poolAddress: string | null = null;
    for (const prog of programsToTry) {
      poolAddress = await findPoolOnChain(
        connection,
        token.mint_address as string,
        prog,
        xStockConfigAddr,
        xStockSymbol,
      );
      if (poolAddress) break;
    }

    if (!poolAddress) {
      return NextResponse.json({ found: false });
    }

    // Pool exists on-chain — mark token as active
    console.log(`[check-pool] pool found on-chain: ${poolAddress} for token ${id}`);
    const isScheduled = Boolean(token.is_scheduled);
    await admin.from("launchpad_tokens").update({
      status:         "active",
      is_tradeable:   !isScheduled,
      pool_address:   poolAddress,
      tx_base64:      null,
      tx_prepared_at: null,
      vanity_secret_key: null,
      // xStock: clear ephemeral config keypair — no longer needed after pool is live
      ...(xStockSymbol ? { dbc_config_secret: null } : {}),
    }).eq("id", id);

    return NextResponse.json({ found: true, poolAddress });

  } catch (err) {
    console.error("check-pool error:", err);
    return NextResponse.json({ found: false, error: String(err) });
  }
}
