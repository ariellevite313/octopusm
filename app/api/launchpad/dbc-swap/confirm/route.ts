/**
 * POST /api/launchpad/dbc-swap/confirm  { txSignature, poolAddress }
 * Après un achat Solana : relit la transaction sur la chaîne et verse les gains du parrain / du post.
 * Rien n'est cru du client : le wallet vient de la session, le montant vient de la chaîne.
 */
import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { awardTradeRewards, SOL_PLATFORM_RATE } from "@/lib/trade-rewards";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const WSOL = "So11111111111111111111111111111111111111112";
const MAX_AGE_MS = 30 * 60 * 1000;
const SIG = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;

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
    const { txSignature, poolAddress } = (await req.json()) as { txSignature?: string; poolAddress?: string };
    if (!txSignature || !SIG.test(txSignature) || !poolAddress) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    let poolPk: PublicKey;
    try { poolPk = new PublicKey(poolAddress); } catch { return NextResponse.json({ error: "Invalid pool" }, { status: 400 }); }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { data: token } = await db.from("launchpad_tokens").select("id, sol_fee_tier").eq("pool_address", poolAddress).maybeSingle();
    if (!token) return NextResponse.json({ error: "Unknown token" }, { status: 404 });

    const conn = new Connection(RPC_URL, "confirmed");
    const tx = await conn.getTransaction(txSignature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }).catch(() => null);
    if (!tx || !tx.meta) return NextResponse.json({ error: "Transaction not found yet" }, { status: 404 });
    if (tx.meta.err !== null) return NextResponse.json({ error: "Transaction failed" }, { status: 400 });
    if (!tx.blockTime || Date.now() - tx.blockTime * 1000 > MAX_AGE_MS) return NextResponse.json({ error: "Transaction too old" }, { status: 400 });

    const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta.loadedAddresses });
    // 1) Le trader est bien celui qui a signé (premier compte = payeur)
    if (keys.get(0)?.toBase58() !== who.wallet) return NextResponse.json({ error: "Not your transaction" }, { status: 403 });

    // 2) La transaction appelle bien le programme propriétaire de ce pool
    const poolInfo = await conn.getAccountInfo(poolPk);
    if (!poolInfo) return NextResponse.json({ error: "Pool not found" }, { status: 404 });
    const ixs = tx.transaction.message.compiledInstructions;
    const callsProgram = ixs.some((ix) => keys.get(ix.programIdIndex)?.equals(poolInfo.owner));
    const touchesPool = Array.from({ length: keys.length }, (_, i) => keys.get(i)).some((k) => k?.equals(poolPk));
    if (!callsProgram || !touchesPool) return NextResponse.json({ error: "Not a swap on this pool" }, { status: 400 });

    // 3) Montant réel payé = variation du coffre « quote » du pool (en SOL)
    const { DynamicBondingCurveClient } = await import("@meteora-ag/dynamic-bonding-curve-sdk");
    const pool = await new DynamicBondingCurveClient(conn, "confirmed").state.getPool(poolPk);
    if (!pool) return NextResponse.json({ error: "Pool not found" }, { status: 404 });
    const vault = (pool.poolState.quoteVault as PublicKey).toBase58();
    let idx = -1;
    for (let i = 0; i < keys.length; i++) if (keys.get(i)?.toBase58() === vault) { idx = i; break; }
    if (idx < 0) return NextResponse.json({ rewarded: false });
    const pre = tx.meta.preTokenBalances?.find((b) => b.accountIndex === idx);
    const post = tx.meta.postTokenBalances?.find((b) => b.accountIndex === idx);
    if (!post || post.mint !== WSOL) return NextResponse.json({ rewarded: false }); // seuls les pools en SOL donnent des gains
    const delta = Number(BigInt(post.uiTokenAmount.amount) - BigInt(pre?.uiTokenAmount.amount ?? "0")) / 1e9;
    if (!(delta > 0)) return NextResponse.json({ rewarded: false }); // vente : pas de gain

    const price = await solPriceUsd();
    if (!(price > 0)) return NextResponse.json({ error: "Price unavailable, retry" }, { status: 503 });
    const r = await awardTradeRewards(db, {
      chain: "solana", tokenId: token.id, txId: txSignature, trader: who.wallet, volumeUsd: delta * price, tsMs: tx.blockTime * 1000,
      feeRate: token.sol_fee_tier === "low" ? SOL_PLATFORM_RATE.low : SOL_PLATFORM_RATE.standard,
    });
    return NextResponse.json({ rewarded: r.referral + r.post > 0 });
  } catch (e) {
    console.error("[dbc-swap/confirm]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
