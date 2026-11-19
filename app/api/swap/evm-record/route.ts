/**
 * POST /api/swap/evm-record { chain, hash, token, to, data, side, sellAmount, buyAmount, feeNative, taker, rec }
 * Enregistre un swap EVM du Terminal (Base, BNB, Ethereum…) après confirmation : historique, alertes rug, OMERO.
 * Le jeton `rec`, signé avec le devis, prouve que la transaction vient de notre devis (frais OM inclus) ;
 * la transaction est relue sur la chaîne (expéditeur, contrat, données, succès). OMERO seulement pour le wallet connecté.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { EVM_CHAINS, NATIVE, isAddr, isEvmChain, type EvmChain } from "@/lib/swap/evm";
import { dataHash, verifyRef } from "@/lib/swap/chill-evm";
import { nativeUsd } from "@/lib/agent-wallet/server";
import { awardSwapOmero } from "@/lib/trade-rewards";
import { limited } from "@/lib/limit";

export const dynamic = "force-dynamic";

async function rpc<T>(chain: EvmChain, method: string, params: unknown[]): Promise<T | null> {
  try {
    const r = await fetch(EVM_CHAINS[chain].rpc, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(8000), cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    return (j.result ?? null) as T | null;
  } catch { return null; }
}

export async function POST(req: Request) {
  { const lim = await limited(req, "evm-record", 60); if (lim) return lim; }
  const b = (await req.json().catch(() => ({}))) as Record<string, string>;
  const { chain, hash, token, to, data, side, sellAmount, buyAmount, feeNative, taker, rec } = b;
  if (!isEvmChain(chain) || !/^0x[0-9a-fA-F]{64}$/.test(hash ?? "") || !isAddr(token) || !isAddr(to) || !isAddr(taker) || typeof data !== "string"
    || (side !== "buy" && side !== "sell") || !/^\d{1,60}$/.test(sellAmount ?? "") || !/^\d{1,60}$/.test(buyAmount ?? "") || !/^\d{1,40}$/.test(feeNative ?? "") || typeof rec !== "string")
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (!verifyRef({ postId: `rec:${side}:${sellAmount}:${buyAmount}`, chain, taker, to, data, feeNative, holder: token }, rec))
    return NextResponse.json({ error: "Unknown quote" }, { status: 400 });

  type Tx = { from?: string; to?: string; input?: string };
  let tx: Tx | null = null, rc: { status?: string; blockNumber?: string } | null = null;
  for (let i = 0; i < 6 && !(tx && rc); i++) {
    const [t, r] = await Promise.all([rpc<Tx>(chain, "eth_getTransactionByHash", [hash]), rpc<{ status?: string; blockNumber?: string }>(chain, "eth_getTransactionReceipt", [hash])]);
    tx = t; rc = r;
    if (!(tx && rc)) await new Promise((res) => setTimeout(res, 1500));
  }
  if (!tx || !rc) return NextResponse.json({ error: "Transaction not found yet" }, { status: 202 });
  if (rc.status !== "0x1" || (tx.from ?? "").toLowerCase() !== taker.toLowerCase() || (tx.to ?? "").toLowerCase() !== to.toLowerCase() || dataHash(tx.input ?? "") !== dataHash(data))
    return NextResponse.json({ error: "Transaction does not match the quote" }, { status: 400 });

  // Montants en natif (18 décimales) : achat = natif vendu, vente = natif reçu (estimé par le devis)
  const px = await nativeUsd(chain).catch(() => 0);
  const nativeRaw = BigInt(side === "buy" ? sellAmount : buyAmount);
  const toUsdN = (raw: bigint) => (px ? (Number(raw) / 1e18) * px : null);
  const volumeUsd = toUsdN(nativeRaw);
  const feeUsd = toUsdN(BigInt(feeNative)) ?? 0;
  const wallet = taker.toLowerCase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: inserted, error } = await db.from("swaps").upsert({
    signature: hash.toLowerCase(), wallet, chain,
    input_mint: side === "buy" ? NATIVE : token.toLowerCase(), output_mint: side === "buy" ? token.toLowerCase() : NATIVE,
    in_amount: sellAmount, out_amount: buyAmount, traded_mint: token.toLowerCase(), side, om_token: false,
    fee_mint: NATIVE, fee_amount: feeNative, fee_usd: feeUsd, volume_usd: volumeUsd,
  }, { onConflict: "signature", ignoreDuplicates: true }).select("id");
  if (error) { console.error("[swap/evm-record]", error.message); return NextResponse.json({ error: "Could not record" }, { status: 500 }); }

  // OMERO : 1 par dollar échangé, seulement si ce wallet EVM est celui de la session
  const session = (await getWalletAddress().catch(() => null))?.toLowerCase() ?? null;
  let omero = 0;
  if (inserted?.length && session === wallet && feeUsd > 0 && volumeUsd) omero = await awardSwapOmero(db, { txId: hash.toLowerCase(), trader: wallet, volumeUsd, feeUsd });
  return NextResponse.json({ recorded: !!inserted?.length, omero });
}
