/**
 * POST /api/launchpad/dbc-swap/reward
 *
 * Awards OMERO to a wallet after a confirmed buy swap.
 * Verifies the tx on-chain before crediting — prevents fake claims.
 *
 * Body: { txSignature, walletAddress, amountLamports }
 * Response: { omeroAwarded } | { error }
 */

import { NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { createAdminClient } from "@/lib/supabase/server";
import { omeroForSwap } from "@/lib/octo";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

/** Max age of a tx to be eligible for reward (5 minutes) */
const MAX_AGE_MS = 5 * 60 * 1_000;

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      txSignature?:   string;
      walletAddress?: string;
      amountLamports?: number; // SOL paid, in lamports
    };

    const { txSignature, walletAddress, amountLamports } = body;

    if (!txSignature || !walletAddress || !amountLamports) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    if (!Number.isInteger(amountLamports) || amountLamports < 1_000_000) {
      // Minimum 0.001 SOL to avoid dust spam
      return NextResponse.json({ error: "Amount too small" }, { status: 400 });
    }

    const omeroAwarded = omeroForSwap(amountLamports);
    if (omeroAwarded <= 0) {
      return NextResponse.json({ omeroAwarded: 0 });
    }

    const admin = createAdminClient() as any;

    // ── Anti-replay: check if this tx was already rewarded ──────────────────
    const { data: existing } = await admin
      .from("octo_transactions")
      .select("id")
      .eq("type", "swap")
      .eq("label", txSignature)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ omeroAwarded: 0, reason: "already_rewarded" });
    }

    // ── Verify tx on-chain ───────────────────────────────────────────────────
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

    if (!tx) {
      return NextResponse.json({ error: "Transaction not found or not confirmed" }, { status: 404 });
    }

    // Must be successful (no error)
    if (tx.meta?.err !== null) {
      return NextResponse.json({ error: "Transaction failed on-chain" }, { status: 400 });
    }

    // Must be recent (anti-replay for old txs)
    if (tx.blockTime) {
      const ageMs = Date.now() - tx.blockTime * 1000;
      if (ageMs > MAX_AGE_MS) {
        return NextResponse.json({ error: "Transaction too old" }, { status: 400 });
      }
    }

    // ── Award OMERO ──────────────────────────────────────────────────────────
    await admin.from("octo_transactions").insert({
      wallet_address: walletAddress,
      type:           "swap",
      amount:         omeroAwarded,
      label:          txSignature,
    });

    // Update leaderboard running total
    const { data: lb } = await admin
      .from("leaderboard_octo")
      .select("total_octo")
      .eq("wallet_address", walletAddress)
      .maybeSingle();

    const current = Number(lb?.total_octo ?? 0);
    await admin.from("leaderboard_octo").upsert(
      { wallet_address: walletAddress, total_octo: current + omeroAwarded },
      { onConflict: "wallet_address" },
    );

    return NextResponse.json({ omeroAwarded });

  } catch (err) {
    console.error("[dbc-swap/reward] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
