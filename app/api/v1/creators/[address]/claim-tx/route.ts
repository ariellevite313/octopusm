/**
 * GET /api/v1/creators/{solana_address}/claim-tx?pool={pool_address}
 *
 * Builds an unsigned Solana VersionedTransaction for claiming creator fees
 * from a Meteora DBC pool.  The caller (Aido) signs it with the user's wallet
 * and sends it to the Solana RPC. No private key ever touches this server.
 *
 * Program: dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN  (Meteora DBC)
 * Instruction: claim_creator_trading_fee
 * Discriminator: [82, 220, 250, 189, 3, 85, 107, 45]
 *
 * Query params:
 *   pool      — Meteora DBC pool address (from /tokens → pool field)
 *   receiver  — (optional) SOL destination. Defaults to {address}.
 *               Pass an Aido vault address to redirect fees there.
 *
 * Response:
 * {
 *   "tx":               "<base64 unsigned VersionedTransaction>",
 *   "recent_blockhash": "<base58>",
 *   "pool":             "<pool_address>",
 *   "creator":          "<creator_address>",
 *   "receiver":         "<receiver_address>",
 *   "claimable_sol":    "0.012345678",
 *   "program":          "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN"
 * }
 *
 * Aido usage (ethers.js / @solana/web3.js):
 *   const { tx } = await fetch(url).then(r => r.json());
 *   const vtx = VersionedTransaction.deserialize(Buffer.from(tx, "base64"));
 *   vtx.sign([userKeypair]);   // or wallet.signTransaction(vtx)
 *   await connection.sendRawTransaction(vtx.serialize());
 */

import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { createAdminClient } from "@/lib/supabase/server";
import {
  isValidSolana, json, err, corsOk, checkRateLimit, getIp, lamportsToSol,
} from "@/lib/v1/helpers";

export async function OPTIONS() { return corsOk(); }

function getSolanaConnection() {
  return new Connection(
    process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
    "confirmed",
  );
}

export async function GET(
  req: Request,
  { params }: { params: { address: string } },
) {
  if (!checkRateLimit(getIp(req))) return err("Too Many Requests", 429);

  const creatorAddress = params.address;
  if (!isValidSolana(creatorAddress)) return err("Invalid Solana address", 400);

  const { searchParams } = new URL(req.url);
  const poolParam     = searchParams.get("pool");
  const receiverParam = searchParams.get("receiver") ?? creatorAddress;

  if (!poolParam)                  return err("Missing ?pool param", 400);
  if (!isValidSolana(poolParam))   return err("Invalid pool address", 400);
  if (!isValidSolana(receiverParam)) return err("Invalid receiver address", 400);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Verify this pool belongs to this creator
  const { data: tokenRow } = await admin
    .from("launchpad_tokens")
    .select("id")
    .eq("pool_address", poolParam)
    .eq("creator_wallet", creatorAddress)
    .or("chain.eq.solana,chain.is.null")
    .maybeSingle();

  if (!tokenRow) return err("Pool not found or not owned by this creator", 404);

  try {
    const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DBC = (sdk as any).DynamicBondingCurveClient;
    const connection = getSolanaConnection();
    const client     = new DBC(connection, "confirmed");

    const creator  = new PublicKey(creatorAddress);
    const pool     = new PublicKey(poolParam);
    const receiver = new PublicKey(receiverParam);

    // Read claimable amount for the response
    let claimableSol = "0";
    try {
      const state = await client.state.getPool(pool);
      const inner = state?.poolState ?? state;
      const rawQ  = inner?.creatorQuoteFee;
      if (rawQ) {
        const lam = typeof rawQ === "object" && rawQ?.toNumber
          ? rawQ.toNumber()
          : typeof rawQ === "number" ? rawQ : parseInt(String(rawQ), 10);
        claimableSol = lamportsToSol(isNaN(lam) ? 0 : lam);
      }
    } catch { /* non-blocking */ }

    // Build transaction via Meteora DBC SDK
    // CreatorService.claimCreatorTradingFee returns a Transaction / VersionedTransaction
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const creatorService: any = client.creator;
    const tx = await creatorService.claimCreatorTradingFee({
      creator,
      pool,
      receiver:      receiver.equals(creator) ? undefined : receiver,
      payer:         creator,
      maxBaseAmount: BigInt("18446744073709551615"), // u64::MAX — claim everything
      maxQuoteAmount: BigInt("18446744073709551615"),
    });

    // Get recent blockhash and convert to VersionedTransaction
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    let serialized: string;

    if (tx instanceof VersionedTransaction) {
      // Already versioned — just serialize
      serialized = Buffer.from(tx.serialize()).toString("base64");
    } else {
      // Legacy Transaction — convert to VersionedMessage
      const { TransactionMessage, VersionedTransaction: VT } = await import("@solana/web3.js");
      tx.recentBlockhash = blockhash;
      tx.feePayer        = creator;
      const msg = new TransactionMessage({
        payerKey:           creator,
        recentBlockhash:    blockhash,
        instructions:       tx.instructions,
      }).compileToV0Message();
      const vtx = new VT(msg);
      serialized = Buffer.from(vtx.serialize()).toString("base64");
    }

    return json({
      tx:               serialized,
      recent_blockhash: blockhash,
      pool:             poolParam,
      creator:          creatorAddress,
      receiver:         receiverParam,
      claimable_sol:    claimableSol,
      program:          "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN",
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to build transaction";
    console.error("[claim-tx]", msg);
    return err(msg, 500);
  }
}

export const dynamic = "force-dynamic";
