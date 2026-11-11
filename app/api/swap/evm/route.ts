/**
 * POST /api/swap/evm { chain, side, token, amount, slippageBps, mode: "price" | "quote" }
 * Swaps Base / BNB Chain / HyperEVM via 0x (frais OM 0,3 %). « quote » renvoie la transaction à faire signer
 * par le portefeuille EVM connecté ; le serveur ne signe rien.
 */
import { NextResponse } from "next/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { checkEvmInput, EvmSwapError, zeroX } from "@/lib/swap/evm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const w = await getWalletAddress();
  const taker = w && w.startsWith("0x") ? w : null;
  const c = checkEvmInput(b, taker);
  if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400 });
  try {
    return NextResponse.json(await zeroX(c.v, b.mode === "quote" ? "quote" : "price"));
  } catch (e) {
    if (e instanceof EvmSwapError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[swap/evm]", e);
    return NextResponse.json({ error: "Could not get a price for this swap" }, { status: 500 });
  }
}
