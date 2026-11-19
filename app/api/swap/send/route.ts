/**
 * POST /api/swap/send { tx } : envoie un swap déjà signé par le wallet de l'utilisateur au block engine de Jito
 * (bundle privé : la transaction n'est pas visible avant d'être incluse, ce qui protège des sandwichs MEV).
 * Repli sur notre RPC si Jito ne répond pas. Le serveur ne signe rien.
 */
import { NextResponse } from "next/server";
import { requireWallet } from "@/lib/social/session";
import { limited } from "@/lib/limit";
import { solanaConnection } from "@/lib/solana/rpc";

export const dynamic = "force-dynamic";
const JITO = "https://mainnet.block-engine.jito.wtf/api/v1/transactions?bundleOnly=true";

export async function POST(req: Request) {
  { const lim = await limited(req, "swap-send", 60); if (lim) return lim; }
  const who = await requireWallet();
  if ("error" in who) return who.error;
  const b = (await req.json().catch(() => ({}))) as { tx?: string };
  const tx = String(b.tx ?? "");
  if (!tx || tx.length > 3000 || !/^[A-Za-z0-9+/=]+$/.test(tx)) return NextResponse.json({ error: "Invalid transaction" }, { status: 400 });
  try {
    const r = await fetch(JITO, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "sendTransaction", params: [tx, { encoding: "base64" }] }),
    });
    const j = (await r.json().catch(() => ({}))) as { result?: string };
    if (r.ok && typeof j.result === "string") return NextResponse.json({ signature: j.result, via: "jito" });
  } catch { /* repli ci-dessous */ }
  try {
    const signature = await solanaConnection().sendRawTransaction(Buffer.from(tx, "base64"), { skipPreflight: false, maxRetries: 3 });
    return NextResponse.json({ signature, via: "rpc" });
  } catch (e) {
    const m = (e as Error).message ?? "";
    return NextResponse.json({ error: /insufficient/i.test(m) ? "Insufficient balance for this swap" : "This swap would fail right now, try again" }, { status: 400 });
  }
}
