/**
 * POST /api/swap/record { signature, inputMint, outputMint }
 * Mémorise un swap confirmé. Le serveur relit la transaction : signataire = portefeuille connecté,
 * programme Jupiter présent, montants et frais lus sur la chaîne.
 */
import { NextResponse } from "next/server";
import { solanaConnection } from "@/lib/solana/rpc";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { SOL_MINT, SWAP_FEE_WALLET, USDC_MINT, feeMintFor, isMint, tradedMint } from "@/lib/swap/core";
import { swapAmounts } from "@/lib/swap/record";
import { isOmToken } from "@/lib/swap/server";

export const dynamic = "force-dynamic";

const SIG = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;
const JUPITER = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
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
  const b = (await req.json().catch(() => ({}))) as { signature?: string; inputMint?: string; outputMint?: string };
  if (!b.signature || !SIG.test(b.signature) || !isMint(b.inputMint) || !isMint(b.outputMint)) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  const { inputMint, outputMint } = b as { inputMint: string; outputMint: string };
  const feeMint = feeMintFor(inputMint, outputMint);
  if (!feeMint) return NextResponse.json({ error: "Unsupported pair" }, { status: 400 });

  const tx = await solanaConnection().getTransaction(b.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }).catch(() => null);
  if (!tx || !tx.meta) return NextResponse.json({ error: "Transaction not found yet" }, { status: 404 });
  if (tx.meta.err !== null) return NextResponse.json({ error: "Transaction failed" }, { status: 400 });
  if (!tx.blockTime || Date.now() - tx.blockTime * 1000 > MAX_AGE_MS) return NextResponse.json({ error: "Transaction too old" }, { status: 400 });

  const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta.loadedAddresses });
  if (keys.get(0)?.toBase58() !== who.wallet) return NextResponse.json({ error: "Not your transaction" }, { status: 403 });
  const programs = tx.transaction.message.compiledInstructions.map((ix) => keys.get(ix.programIdIndex)?.toBase58());
  if (!programs.includes(JUPITER)) return NextResponse.json({ error: "Not a swap" }, { status: 400 });

  const a = swapAmounts({
    wallet: who.wallet, feeWallet: SWAP_FEE_WALLET, feeLamports: tx.meta.fee,
    preLamports: tx.meta.preBalances[0], postLamports: tx.meta.postBalances[0],
    preTokens: (tx.meta.preTokenBalances ?? []) as never, postTokens: (tx.meta.postTokenBalances ?? []) as never,
  }, inputMint, outputMint, feeMint);
  if (!a) return NextResponse.json({ error: "Not a swap" }, { status: 400 });

  const traded = tradedMint(inputMint, outputMint);
  const side = traded === outputMint ? "buy" : "sell";
  const baseMint = traded === outputMint ? inputMint : outputMint;
  const baseRaw = traded === outputMint ? a.inAmount : a.outAmount;
  const sol = await solPriceUsd();
  const toUsd = (mint: string, raw: bigint): number | null =>
    mint === USDC_MINT ? Number(raw) / 1e6 : mint === SOL_MINT && sol > 0 ? (Number(raw) / 1e9) * sol : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { error } = await db.from("swaps").upsert({
    signature: b.signature, wallet: who.wallet, chain: "solana", input_mint: inputMint, output_mint: outputMint,
    in_amount: a.inAmount.toString(), out_amount: a.outAmount.toString(), traded_mint: traded, side,
    om_token: await isOmToken(traded), fee_mint: a.feeAmount > 0n ? feeMint : null, fee_amount: a.feeAmount.toString(),
    fee_usd: a.feeAmount > 0n ? toUsd(feeMint, a.feeAmount) : 0, volume_usd: toUsd(baseMint, baseRaw),
    created_at: new Date(tx.blockTime * 1000).toISOString(),
  }, { onConflict: "signature", ignoreDuplicates: true });
  if (error) { console.error("[swap/record]", error.message); return NextResponse.json({ error: "Could not record" }, { status: 500 }); }
  return NextResponse.json({ recorded: true, side, fee: a.feeAmount.toString() });
}
