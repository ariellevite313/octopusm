/**
 * GET /api/markets/preview?text=...  → { market }  (aperçu d'un marché dont le lien est collé dans un post)
 * Lecture publique, pas d'écriture. Le texte est limité à 2000 caractères.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { extractMarketRef } from "@/lib/social/rich";
import { previewMarket } from "@/lib/social/posts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const text = (new URL(req.url).searchParams.get("text") ?? "").slice(0, 2000);
  const ref = extractMarketRef(text);
  if (!ref) return NextResponse.json({ market: null });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const market = await previewMarket(createAdminClient() as any, ref).catch(() => null);
  return NextResponse.json({ market });
}
