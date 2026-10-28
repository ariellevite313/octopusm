/**
 * POST /api/launchpad/[id]/record-fee-tx  { feeTxSig }
 *
 * Appelée par le client juste après TX1 (paiement des frais de création).
 * Enregistre fee_paid_at seulement après avoir vérifié sur la chaîne que la tx :
 *  - est confirmée, récente et sans erreur ;
 *  - est signée par le créateur connecté (session) ;
 *  - transfère au moins le montant dû vers le wallet de la plateforme ;
 *  - n'a pas déjà servi pour un autre token.
 * Si TX2 (création du pool) est rejetée puis réessayée, prepare-fee-tx peut alors sauter TX1.
 */
import { NextResponse } from "next/server";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { PLATFORM_FEE_SOL, SCHEDULED_FEE_SOL } from "@/lib/launch/platform-fee";

type RouteParams = { params: Promise<{ id: string }> };

const SIG = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;
const MAX_AGE_MS = 30 * 60 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request, { params }: RouteParams) {
  const { id } = await params;
  try {
    const sess = await requireWallet();
    if ("error" in sess) return sess.error;

    const body = await req.json() as { feeTxSig?: string };
    if (!body.feeTxSig || !SIG.test(body.feeTxSig)) {
      return NextResponse.json({ error: "feeTxSig is required" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    const { data: token } = await admin
      .from("launchpad_tokens")
      .select("creator_wallet, is_scheduled")
      .eq("id", id)
      .maybeSingle();

    if (!token || token.creator_wallet !== sess.wallet) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const secret = process.env.PLATFORM_WALLET_SECRET;
    const rpc = process.env.SOLANA_RPC_URL;
    if (!secret || !rpc) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    const platform = Keypair.fromSecretKey(bs58.decode(secret)).publicKey.toBase58();
    const due = Math.floor(PLATFORM_FEE_SOL * LAMPORTS_PER_SOL) + (token.is_scheduled ? Math.floor(SCHEDULED_FEE_SOL * LAMPORTS_PER_SOL) : 0);

    // La tx vient d'être diffusée : on laisse quelques secondes pour la confirmation.
    const conn = new Connection(rpc, "confirmed");
    let tx = null;
    for (let i = 0; i < 6 && !tx; i++) {
      tx = await conn.getTransaction(body.feeTxSig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }).catch(() => null);
      if (!tx) await sleep(2500);
    }
    if (!tx || !tx.meta) return NextResponse.json({ error: "Transaction not confirmed yet" }, { status: 409 });
    if (tx.meta.err !== null) return NextResponse.json({ error: "Transaction failed" }, { status: 400 });
    if (!tx.blockTime || Date.now() - tx.blockTime * 1000 > MAX_AGE_MS) {
      return NextResponse.json({ error: "Transaction too old" }, { status: 400 });
    }

    const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta.loadedAddresses });
    if (keys.get(0)?.toBase58() !== sess.wallet) {
      return NextResponse.json({ error: "Not your transaction" }, { status: 403 });
    }
    let idx = -1;
    for (let i = 0; i < keys.length; i++) if (keys.get(i)?.toBase58() === platform) { idx = i; break; }
    if (idx < 0 || tx.meta.postBalances[idx] - tx.meta.preBalances[idx] < due) {
      return NextResponse.json({ error: "Fee transfer not found in transaction" }, { status: 400 });
    }

    // Une même tx ne paie qu'un seul token
    const { data: used } = await admin.from("launchpad_tokens").select("id").eq("fee_tx_sig", body.feeTxSig).neq("id", id).limit(1);
    if (used?.length) return NextResponse.json({ error: "Transaction already used" }, { status: 409 });

    await admin
      .from("launchpad_tokens")
      .update({ fee_paid_at: new Date().toISOString(), fee_tx_sig: body.feeTxSig })
      .eq("id", id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("record-fee-tx error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
