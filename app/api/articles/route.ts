/** POST /api/articles  { title, cover_url?, body } — publie un article long dans le fil. */
import { NextResponse } from "next/server";
import { requireWallet } from "@/lib/social/session";
import { createArticle } from "@/lib/social/create-article";
import { limited } from "@/lib/limit";

export async function POST(req: Request) {
  { const lim = await limited(req, "article-create", 10, 60_000); if (lim) return lim; }
  const s = await requireWallet();
  if ("error" in s) return s.error;
  const input = await req.json().catch(() => null);
  if (!input || typeof input !== "object") return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const r = await createArticle(s.wallet, input as Record<string, unknown>);
  return NextResponse.json(r.data, { status: r.status });
}
