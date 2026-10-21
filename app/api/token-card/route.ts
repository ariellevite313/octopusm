/** GET /api/token-card?ticker=CLAWDTRUST&wallet=<auteur> — carte token d'une publication. */
import { NextResponse } from "next/server";
import { getTokenCard } from "@/lib/social/token-card";
import { normWallet } from "@/lib/social/posts";

export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ticker = url.searchParams.get("ticker") ?? "";
  const wallet = url.searchParams.get("wallet");
  if (!/^[A-Za-z][A-Za-z0-9]{1,15}$/.test(ticker)) return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
  const card = await getTokenCard(url.origin, ticker, wallet ? normWallet(wallet) : null);
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(card, { headers: { "Cache-Control": "public, s-maxage=120" } });
}
