/**
 * POST /api/launchpad/dbc-swap/reward
 *
 * Awards OMERO to a wallet after a confirmed buy swap.
 * Verifies the tx on-chain before crediting — prevents fake claims.
 *
 * Body: { txSignature, walletAddress, poolAddress } (le montant est lu dans la transaction)
 * Response: { omeroAwarded } | { error }
 */

import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { createAdminClient } from "@/lib/supabase/server";
import { omeroForSwap } from "@/lib/octo";
import { requireWallet } from "@/lib/social/session";

const SIG = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;
const WSOL = "So11111111111111111111111111111111111111112";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

/** Max age of a tx to be eligible for reward (5 minutes) */
const MAX_AGE_MS = 5 * 60 * 1_000;

export async function POST(req: Request) {
  try {
    // Session obligatoire : le wallet crédité est celui de la session
    const sess = await requireWallet();
    if ("error" in sess) return sess.error;

    const body = await req.json() as { txSignature?: string; walletAddress?: string; poolAddress?: string };
    const { txSignature, walletAddress, poolAddress } = body;

    if (!txSignature || !walletAddress || !poolAddress || !SIG.test(txSignature)) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (walletAddress !== sess.wallet) {
      return NextResponse.json({ error: "Not your wallet" }, { status: 403 });
    }

    const admin = createAdminClient() as any;

    // ── Anti-replay (rapide) : cette tx a-t-elle déjà été récompensée ? ───────
    const { data: existing } = await admin
      .from("octo_transactions")
      .select("id")
      .eq("type", "swap")
      .eq("label", txSignature)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ omeroAwarded: 0, reason: "already_rewarded" });
    }

    // ── Vérifier la tx on-chain ──────────────────────────────────────────────
    const conn = new Connection(RPC_URL, "confirmed");

    let tx;
    try {
      tx = await conn.getTransaction(txSignature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });
    } catch {
      return NextResponse.json({ error: "Could not fetch transaction" }, { status: 502 });
    }

    if (!tx || !tx.meta) {
      return NextResponse.json({ error: "Transaction not found or not confirmed" }, { status: 404 });
    }
    if (tx.meta.err !== null) {
      return NextResponse.json({ error: "Transaction failed on-chain" }, { status: 400 });
    }

    // Signée par le wallet de la session (sinon n'importe qui réclamerait la tx d'un autre)
    const payer = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta.loadedAddresses }).get(0)?.toBase58();
    if (payer !== walletAddress) {
      return NextResponse.json({ error: "Not your transaction" }, { status: 403 });
    }

    if (!tx.blockTime || Date.now() - tx.blockTime * 1000 > MAX_AGE_MS) {
      return NextResponse.json({ error: "Transaction too old" }, { status: 400 });
    }

    // La tx doit être un swap sur ce pool (même contrôle que dbc-swap/confirm) : programme propriétaire du pool + pool touché.
    let poolPk: PublicKey;
    try { poolPk = new PublicKey(poolAddress); } catch { return NextResponse.json({ error: "Invalid pool" }, { status: 400 }); }
    const { data: known } = await admin.from("launchpad_tokens").select("id").eq("pool_address", poolAddress).maybeSingle();
    if (!known) return NextResponse.json({ error: "Unknown token" }, { status: 404 });
    const poolInfo = await conn.getAccountInfo(poolPk);
    if (!poolInfo) return NextResponse.json({ error: "Pool not found" }, { status: 404 });
    const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta.loadedAddresses });
    const callsProgram = tx.transaction.message.compiledInstructions.some((ix) => keys.get(ix.programIdIndex)?.equals(poolInfo.owner));
    const touchesPool = Array.from({ length: keys.length }, (_, i) => keys.get(i)).some((k) => k?.equals(poolPk));
    if (!callsProgram || !touchesPool) return NextResponse.json({ error: "Not a swap on this pool" }, { status: 400 });

    // Montant = variation du coffre « quote » du pool en SOL, lue dans la tx (le client n'envoie aucun montant).
    const { DynamicBondingCurveClient } = await import("@meteora-ag/dynamic-bonding-curve-sdk");
    const pool = await new DynamicBondingCurveClient(conn, "confirmed").state.getPool(poolPk);
    if (!pool) return NextResponse.json({ error: "Pool not found" }, { status: 404 });
    const vault = (pool.poolState.quoteVault as PublicKey).toBase58();
    let vIdx = -1;
    for (let i = 0; i < keys.length; i++) if (keys.get(i)?.toBase58() === vault) { vIdx = i; break; }
    if (vIdx < 0) return NextResponse.json({ omeroAwarded: 0 });
    const preB = tx.meta.preTokenBalances?.find((x) => x.accountIndex === vIdx);
    const postB = tx.meta.postTokenBalances?.find((x) => x.accountIndex === vIdx);
    if (!postB || postB.mint !== WSOL) return NextResponse.json({ omeroAwarded: 0 });
    const spent = Number(BigInt(postB.uiTokenAmount.amount) - BigInt(preB?.uiTokenAmount.amount ?? "0"));
    if (!Number.isInteger(spent) || spent < 1_000_000) {
      // Achat seulement (delta positif), minimum 0.001 SOL pour éviter la poussière
      return NextResponse.json({ error: "Amount too small" }, { status: 400 });
    }

    const omeroAwarded = omeroForSwap(spent);
    if (omeroAwarded <= 0) {
      return NextResponse.json({ omeroAwarded: 0 });
    }

    // ── Crédit : l'index unique (type, label) garantit une seule récompense par tx ──
    const { error: insErr } = await admin.from("octo_transactions").insert({
      wallet_address: walletAddress,
      type:           "swap",
      amount:         omeroAwarded,
      label:          txSignature,
    });
    if (insErr) {
      if (insErr.code === "23505") return NextResponse.json({ omeroAwarded: 0, reason: "already_rewarded" });
      throw insErr;
    }

    // Total du classement : incrément atomique (repli en lecture puis écriture si la fonction SQL manque)
    const { error: rpcErr } = await admin.rpc("add_leaderboard_octo", { p_wallet: walletAddress, p_amount: omeroAwarded });
    if (rpcErr) {
      const { data: lb } = await admin.from("leaderboard_octo").select("total_octo").eq("wallet_address", walletAddress).maybeSingle();
      await admin.from("leaderboard_octo").upsert(
        { wallet_address: walletAddress, total_octo: Number(lb?.total_octo ?? 0) + omeroAwarded },
        { onConflict: "wallet_address" },
      );
    }

    return NextResponse.json({ omeroAwarded });

  } catch (err) {
    console.error("[dbc-swap/reward] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
