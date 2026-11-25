/** Carnet d'ordres d'un token Solana (mode Limit du Terminal). GET ?mint= */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { limited } from "@/lib/limit";
import { getBook } from "@/lib/terminal-book";

export const dynamic = "force-dynamic";
const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET(req: Request) {
  { const lim = await limited(req, "book", 90); if (lim) return lim; }
  const mint = new URL(req.url).searchParams.get("mint") ?? "";
  if (!MINT.test(mint)) return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  const book = await getBook(createAdminClient(), mint).catch(() => null);
  if (!book) return NextResponse.json({ error: "Price not available for this token" }, { status: 404 });
  return NextResponse.json(book, { headers: { "Cache-Control": "public, max-age=3" } });
}
