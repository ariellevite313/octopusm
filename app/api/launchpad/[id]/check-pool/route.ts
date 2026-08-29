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
): Promise<string | null> {
  const mint = new PublicKey(mintAddress);

  // Try known seed combinations used by Meteora DBC for the virtual pool PDA
  const seedSets = [
    [Buffer.from("virtual_pool"), mint.toBuffer()],
    [Buffer.from("pool"), mint.toBuffer()],
  ];

  for (const seeds of seedSets) {
    try {
      const [pda] = PublicKey.findProgramAddressSync(seeds, dbcProgramId);
      const info = await connection.getAccountInfo(pda);
      if (info !== null) return pda.toBase58();
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
      .select("status, creator_wallet, mint_address, tx_base64, is_scheduled")
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

    // Fallback: try known Meteora DBC program IDs
    const programsToTry: PublicKey[] = dbcProgramId
      ? [dbcProgramId]
      : [
          new PublicKey("DBi9ywgDesNsfaqcfBQ97WRNB7PfmHMmMVdSzD1YuMp"),
          new PublicKey("MeteoraDbc11111111111111111111111111111111"),
        ].filter(k => {
          try { k.toBase58(); return true; } catch { return false; }
        });

    let poolAddress: string | null = null;
    for (const prog of programsToTry) {
      poolAddress = await findPoolOnChain(connection, token.mint_address as string, prog);
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
    }).eq("id", id);

    return NextResponse.json({ found: true, poolAddress });

  } catch (err) {
    console.error("check-pool error:", err);
    return NextResponse.json({ found: false, error: String(err) });
  }
}
