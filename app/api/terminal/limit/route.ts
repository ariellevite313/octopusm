/**
 * Ordres limités (Solana) du wallet connecté, via Jupiter.
 * GET ?mint= : ordres actifs. POST { action: "create", side, mint, amount, targetMcap } | { action: "cancel", order }
 * | { action: "execute", signedTransaction, requestId }. Le serveur ne signe jamais : il renvoie la transaction à signer.
 */
import { NextResponse } from "next/server";
import { requireWallet } from "@/lib/social/session";
import { limited } from "@/lib/limit";
import { createAdminClient } from "@/lib/supabase/server";
import { activeOrders, cancelOrder, createLimitOrder, executeOrder, sendSigned, TriggerError } from "@/lib/swap/jup-trigger";

export const dynamic = "force-dynamic";
const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

async function solWallet() {
  const who = await requireWallet();
  if ("error" in who) return { error: who.error };
  if (who.wallet.startsWith("0x")) return { error: NextResponse.json({ error: "Connect a Solana wallet" }, { status: 400 }) };
  return { wallet: who.wallet };
}

export async function GET(req: Request) {
  const w = await solWallet();
  if ("error" in w) return NextResponse.json({ orders: [] });
  const mint = new URL(req.url).searchParams.get("mint");
  try {
    const orders = (await activeOrders(w.wallet)).filter((o) => !mint || o.inputMint === mint || o.outputMint === mint);
    return NextResponse.json({ orders });
  } catch { return NextResponse.json({ orders: [] }); }
}

export async function POST(req: Request) {
  { const lim = await limited(req, "limit", 30); if (lim) return lim; }
  const w = await solWallet();
  if ("error" in w) return w.error;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    if (b.action === "create") {
      const side = b.side === "sell" ? "sell" : "buy", mint = String(b.mint ?? ""), amount = Number(b.amount), targetMcap = Number(b.targetMcap);
      if (!MINT.test(mint) || !(amount > 0) || !(targetMcap > 0) || targetMcap > 1e13) return NextResponse.json({ error: "Invalid order" }, { status: 400 });
      const res = await createLimitOrder(w.wallet, { side, mint, amount, targetMcap });
      // Gardé pour le carnet d'ordres (« pending » jusqu'à ce que Jupiter le montre actif ; aucun wallet affiché)
      if (res.order) {
         
        await (createAdminClient() as any).from("om_limit_orders").upsert({ order_key: res.order, maker: w.wallet, mint, side, amount_sol: res.amountSol, target_mcap: targetMcap, status: "pending" })
          .then(() => null, () => null);
      }
      return NextResponse.json(res);
    }
    if (b.action === "cancel") {
      if (!MINT.test(String(b.order ?? ""))) return NextResponse.json({ error: "Invalid order" }, { status: 400 });
      return NextResponse.json(await cancelOrder(w.wallet, String(b.order)));
    }
    if (b.action === "execute") {
      const tx = String(b.signedTransaction ?? ""), id = String(b.requestId ?? "");
      if (!tx || tx.length > 4000 || !id) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      return NextResponse.json(await executeOrder(tx, id));
    }
    if (b.action === "send") {
      const tx = String(b.signedTransaction ?? "");
      if (!tx || tx.length > 4000) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      return NextResponse.json(await sendSigned(tx));
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    if (e instanceof TriggerError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[terminal/limit]", e);
    return NextResponse.json({ error: "Limit order failed" }, { status: 500 });
  }
}
