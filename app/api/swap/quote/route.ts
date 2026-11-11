/** POST /api/swap/quote { inputMint, outputMint, amount, slippageBps } : prix, minimum reçu et frais (sans transaction). */
import { NextResponse } from "next/server";
import { checkSwapInput } from "@/lib/swap/core";
import { swapQuote, SwapError } from "@/lib/swap/jupiter";
import { feeBpsFor } from "@/lib/swap/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { resolveRef } from "@/lib/swap/chill-server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const c = checkSwapInput(body);
  if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400 });
  try {
    const w = await getWalletAddress();
    const taker = w && !w.startsWith("0x") ? w : undefined;
    const ref = body.ref ? await resolveRef(body.ref, taker ?? "", c.v.inputMint, c.v.outputMint) : null;
    const q = await swapQuote(c.v, await feeBpsFor(c.v.inputMint, c.v.outputMint), taker, ref);
    return NextResponse.json(q);
  } catch (e) {
    if (e instanceof SwapError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[swap/quote]", e);
    return NextResponse.json({ error: "Could not get a price for this swap" }, { status: 500 });
  }
}
