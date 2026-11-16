/**
 * GET /api/terminal/dev?mint=…  → analyse du dev d'un token Solana (détenu, ventes, destinataires, transactions).
 * ClawdTrust ($CLT) est exclu. Lecture publique.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { analyzeDev } from "@/lib/terminal-dev";
import { RUG_EXEMPT } from "@/lib/terminal-rug";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const mint = new URL(req.url).searchParams.get("mint") ?? "";
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) return NextResponse.json({ error: "invalid mint" }, { status: 400 });
  if (RUG_EXEMPT.has(mint)) return NextResponse.json({ exempt: true });
  // Token lancé sur OM : le créateur est connu, pas besoin de le chercher sur la chaîne
  let creator: string | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (createAdminClient() as any).from("launchpad_tokens").select("creator_wallet").eq("mint_address", mint).maybeSingle();
    creator = (data?.creator_wallet as string | undefined) ?? null;
  } catch { /* base indisponible : on cherche sur la chaîne */ }
  try {
    const info = await analyzeDev(mint, creator);
    return NextResponse.json(info, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
