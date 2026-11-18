/** GET /api/token-card?ticker=CLAWDTRUST&wallet=<auteur> — carte token d'une publication. */
import { limited } from "@/lib/limit";
import { NextResponse } from "next/server";
import { getTokenCard } from "@/lib/social/token-card";
import { normWallet } from "@/lib/social/posts";

export const maxDuration = 60;

export async function GET(req: Request) {
  { const lim = await limited(req, "token-card", 20); if (lim) return lim; }
  const url = new URL(req.url);
  const ticker = url.searchParams.get("ticker") ?? "";
  const wallet = url.searchParams.get("wallet");
  if (!/^[A-Za-z][A-Za-z0-9]{1,15}$/.test(ticker)) return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
  if (wallet && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet) && !/^0x[0-9a-fA-F]{40}$/.test(wallet)) return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
  const card = await getTokenCard(process.env.NEXT_PUBLIC_SITE_URL || url.origin, ticker, wallet ? normWallet(wallet) : null);
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(card, { headers: { "Cache-Control": "public, s-maxage=120" } });
}
