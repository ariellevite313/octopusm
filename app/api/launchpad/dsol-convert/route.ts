/**
 * POST /api/launchpad/dsol-convert { dir: "toDoge" | "toSol", amount, slippageBps, quoteOnly?, mint? }
 * mint : monnaie de paire à convertir (DOGE par défaut, ou PEPE ; seulement celles qui ont une route en SOL).
 *
 * Conversion SOL <-> DOGE pour acheter ou vendre un token DSOL-20 en SOL.
 * Aucun frais OM sur cette étape : les frais créateur et plateforme sont pris en DOGE par le pool du token.
 * Avec quoteOnly : prix seulement. Sinon : transaction non signée pour le portefeuille connecté.
 */
import { NextResponse } from "next/server";
import { checkSwapInput, SOL_MINT } from "@/lib/swap/core";
import { swapQuote, swapTransaction, SwapError } from "@/lib/swap/jupiter";
import { requireWallet } from "@/lib/social/session";
import { DOGE_MINT } from "@/lib/solana/doge";
import { pairQuoteByMint } from "@/lib/solana/quotes";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const toDoge = body.dir === "toDoge";
  if (!toDoge && body.dir !== "toSol") return NextResponse.json({ error: "Invalid direction" }, { status: 400 });
  const pq = pairQuoteByMint(typeof body.mint === "string" ? body.mint : DOGE_MINT);
  if (!pq?.solRoute) return NextResponse.json({ error: "This token can't be paid in SOL" }, { status: 400 });
  const QUOTE = pq.mint;
  const c = checkSwapInput({
    inputMint: toDoge ? SOL_MINT : QUOTE,
    outputMint: toDoge ? QUOTE : SOL_MINT,
    amount: body.amount, slippageBps: body.slippageBps,
  });
  if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400 });
  try {
    if (body.quoteOnly) return NextResponse.json(await swapQuote(c.v, 0));
    const who = await requireWallet();
    if ("error" in who) return who.error;
    if (who.wallet.startsWith("0x")) return NextResponse.json({ error: "Connect a Solana wallet to swap" }, { status: 400 });
    return NextResponse.json(await swapTransaction(c.v, 0, who.wallet));
  } catch (e) {
    if (e instanceof SwapError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[dsol-convert]", e);
    return NextResponse.json({ error: "Could not convert right now" }, { status: 500 });
  }
}
