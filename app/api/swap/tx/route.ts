/**
 * POST /api/swap/tx { inputMint, outputMint, amount, slippageBps }
 * Transaction de swap non signée pour le portefeuille connecté (Solana). Le serveur ne signe jamais.
 */
import { NextResponse } from "next/server";
import { checkSwapInput } from "@/lib/swap/core";
import { swapTransaction, SwapError } from "@/lib/swap/jupiter";
import { feeBpsFor } from "@/lib/swap/server";
import { requireWallet } from "@/lib/social/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const who = await requireWallet();
  if ("error" in who) return who.error;
  if (who.wallet.startsWith("0x")) return NextResponse.json({ error: "Connect a Solana wallet to swap" }, { status: 400 });
  const c = checkSwapInput((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400 });
  try {
    return NextResponse.json(await swapTransaction(c.v, await feeBpsFor(c.v.inputMint, c.v.outputMint), who.wallet));
  } catch (e) {
    if (e instanceof SwapError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[swap/tx]", e);
    return NextResponse.json({ error: "Could not build the swap" }, { status: 500 });
  }
}
