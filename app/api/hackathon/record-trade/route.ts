/**
 * POST /api/hackathon/record-trade  { txSignature, mint }
 * Mémorise un achat ou une vente faits après la graduation (Jupiter). Le serveur relit la transaction :
 * le signataire doit être le wallet connecté, et les montants viennent de la chaîne.
 */
import { NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { swapDelta } from "@/lib/hackathon/swap-delta";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const SIG = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;
const MAX_AGE_MS = 30 * 60 * 1000;

async function solPriceUsd(): Promise<number> {
  try {
    const r = await fetch("https://api.coinbase.com/v2/prices/SOL-USD/spot", { signal: AbortSignal.timeout(4000) });
    return Number(((await r.json()) as { data?: { amount?: string } }).data?.amount) || 0;
  } catch { return 0; }
}

export async function POST(req: Request) {
  const who = await requireWallet();
  if ("error" in who) return who.error;
  try {
    const { txSignature, mint } = (await req.json()) as { txSignature?: string; mint?: string };
    if (!txSignature || !SIG.test(txSignature) || !mint) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { data: token } = await db.from("launchpad_tokens").select("id, mint_address, chain").eq("mint_address", mint).maybeSingle();
    if (!token || token.chain === "arc") return NextResponse.json({ error: "Unknown token" }, { status: 404 });

    const conn = new Connection(RPC_URL, "confirmed");
    const tx = await conn.getTransaction(txSignature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }).catch(() => null);
    if (!tx || !tx.meta) return NextResponse.json({ error: "Transaction not found yet" }, { status: 404 });
    if (tx.meta.err !== null) return NextResponse.json({ error: "Transaction failed" }, { status: 400 });
    if (!tx.blockTime || Date.now() - tx.blockTime * 1000 > MAX_AGE_MS) return NextResponse.json({ error: "Transaction too old" }, { status: 400 });

    const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta.loadedAddresses });
    if (keys.get(0)?.toBase58() !== who.wallet) return NextResponse.json({ error: "Not your transaction" }, { status: 403 });

    const d = swapDelta({
      wallet: who.wallet, mint, feeLamports: tx.meta.fee,
      preLamports: tx.meta.preBalances[0], postLamports: tx.meta.postBalances[0],
      preTokens: (tx.meta.preTokenBalances ?? []) as never, postTokens: (tx.meta.postTokenBalances ?? []) as never,
    });
    if (!d) return NextResponse.json({ recorded: false });

    const price = await solPriceUsd();
    if (!(price > 0)) return NextResponse.json({ error: "Price unavailable, retry" }, { status: 503 });
    const usd = d.solAmount * price;
    const { error } = await db.from("token_trades").upsert({
      tx_id: txSignature, token_id: token.id, wallet: who.wallet, side: d.side, usd, token_amount: d.tokenAmount,
      ts: new Date(tx.blockTime * 1000).toISOString(),
    }, { onConflict: "tx_id,token_id", ignoreDuplicates: true });
    if (error) { console.error("[record-trade]", error.message); return NextResponse.json({ error: "Could not record" }, { status: 500 }); }

    // Pas de gain parrain/post ici : après la graduation, la part de la plateforme n'est pas celle de la courbe.
    return NextResponse.json({ recorded: true, side: d.side, usd });
  } catch (e) {
    console.error("[hackathon/record-trade]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
