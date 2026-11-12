/** POST /api/agent-wallets/[id]/withdraw : renvoie tout le solde du wallet de l'IA vers le wallet de l'humain (jamais ailleurs). */
import { NextResponse } from "next/server";
import { requireWallet } from "@/lib/social/session";
import { AgentWalletError, withdrawAll } from "@/lib/agent-wallet/server";
import { AgentKeyError } from "@/lib/agent-wallet/keys";
import { rateHit } from "@/lib/rate-limit";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  const { id } = await params;
  if (!(await rateHit(`agent-withdraw:${s.wallet}`, 5, 600_000))) return NextResponse.json({ error: "Too many withdrawals, wait a few minutes" }, { status: 429 });
  try { return NextResponse.json({ ok: true, txs: await withdrawAll(s.wallet, id) }); }
  catch (e) {
    if (e instanceof AgentWalletError || e instanceof AgentKeyError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[agent-wallets] withdraw:", e);
    return NextResponse.json({ error: "The withdrawal failed" }, { status: 500 });
  }
}
