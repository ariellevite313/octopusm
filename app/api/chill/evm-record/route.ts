/**
 * POST /api/chill/evm-record { chain, hash, postId, holder, feeNative, taker, token }
 * Enregistre la part (40 %) du détenteur après un swap EVM lancé depuis un post « sac ». Le jeton signé remis avec le devis
 * prouve que la transaction vient de notre devis ; la transaction est relue sur la chaîne (expéditeur, contrat, données, succès).
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { EVM_CHAINS, isAddr, isEvmChain } from "@/lib/swap/evm";
import { CHILL_EVM_SHARE_BPS, dataHash, verifyRef } from "@/lib/swap/chill-evm";

export const dynamic = "force-dynamic";

async function rpc<T>(chain: keyof typeof EVM_CHAINS, method: string, params: unknown[]): Promise<T | null> {
  const r = await fetch(EVM_CHAINS[chain].rpc, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(8000), cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  return (j.result ?? null) as T | null;
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { chain, hash, postId, holder, feeNative, taker, token, to, data, refToken } = b as Record<string, string>;
  if (!isEvmChain(chain) || !/^0x[0-9a-fA-F]{64}$/.test(hash ?? "") || !isAddr(holder) || !isAddr(taker) || !/^\d{1,40}$/.test(feeNative ?? "") || !isAddr(token) || !isAddr(to) || typeof data !== "string" || typeof refToken !== "string" || typeof postId !== "string")
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (!verifyRef({ postId, chain, taker, to, data, feeNative, holder }, refToken)) return NextResponse.json({ error: "Unknown quote" }, { status: 400 });

  // La transaction doit exister, venir de l'acheteur, appeler le même contrat avec les mêmes données, et avoir réussi
  type Tx = { from?: string; to?: string; input?: string };
  let tx: Tx | null = null;
  let rc: { status?: string } | null = null;
  for (let i = 0; i < 6 && !(tx && rc); i++) {
    const [t, r] = await Promise.all([rpc<Tx>(chain, "eth_getTransactionByHash", [hash]), rpc<{ status?: string }>(chain, "eth_getTransactionReceipt", [hash])]);
    tx = t; rc = r;
    if (!(tx && rc)) await new Promise((res) => setTimeout(res, 1500));
  }
  if (!tx || !rc) return NextResponse.json({ error: "Transaction not found yet" }, { status: 202 });
  if (rc.status !== "0x1" || (tx.from ?? "").toLowerCase() !== taker.toLowerCase() || (tx.to ?? "").toLowerCase() !== to.toLowerCase() || dataHash(tx.input ?? "") !== dataHash(data))
    return NextResponse.json({ error: "Transaction does not match the quote" }, { status: 400 });

  const owed = (BigInt(feeNative) * BigInt(CHILL_EVM_SHARE_BPS)) / 10_000n;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (createAdminClient() as any).from("chill_rewards").insert({
    post_id: postId, chain, holder: holder.toLowerCase(), taker: taker.toLowerCase(), token: token.toLowerCase(), tx_hash: hash.toLowerCase(),
    fee_native: feeNative, owed_native: owed.toString(),
  });
  if (error && error.code !== "23505") { console.error("[chill evm-record]", error.message); return NextResponse.json({ error: "Could not record" }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
