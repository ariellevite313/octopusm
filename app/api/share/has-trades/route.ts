/**
 * GET /api/share/has-trades?wallet=…&mint=…  →  { has: boolean }
 * Le wallet a-t-il des achats / ventes connus d'OM sur ce token ? Sert au bouton de partage du Terminal :
 * avec des trades, on partage la carte de gains ; sinon, seulement le lien du token.
 */
import { NextResponse } from "next/server";
import { limited } from "@/lib/limit";
import { createAdminClient } from "@/lib/supabase/server";
import { loadTokenTrades } from "@/lib/trade-card";

const ok = (s: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s) || /^0x[0-9a-fA-F]{40}$/.test(s);

export async function GET(req: Request) {
  { const lim = await limited(req, "has-trades", 60); if (lim) return lim; }
  const u = new URL(req.url);
  const wallet = u.searchParams.get("wallet") ?? "", mint = u.searchParams.get("mint") ?? "";
  if (!ok(wallet) || !ok(mint)) return NextResponse.json({ has: false });
  const chain = mint.startsWith("0x") ? "arc" : "solana";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: lt } = await db.from("launchpad_tokens").select("id, chain, arc_launch_id").ilike("mint_address", mint).maybeSingle();
  const trades = await loadTokenTrades(db, chain, mint, lt ?? null, chain === "arc" ? wallet.toLowerCase() : wallet, 5).catch(() => []);
  return NextResponse.json({ has: trades.length > 0 }, { headers: { "Cache-Control": "private, max-age=30" } });
}
