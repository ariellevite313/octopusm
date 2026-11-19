/**
 * GET /api/terminal/positions : positions du wallet connecté sur les tokens tradés via OM (swaps du Terminal et du feed,
 * achats et ventes sur le launchpad), avec gain réalisé + latent. Les 12 tokens les plus récents.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { getTradeCard } from "@/lib/trade-card";
import { limited } from "@/lib/limit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  { const lim = await limited(req, "positions", 20); if (lim) return lim; }
  const wallet = await getWalletAddress();
  if (!wallet) return NextResponse.json({ positions: [] });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const evm = wallet.startsWith("0x");
  const [{ data: sw }, { data: tt }, { data: at }] = await Promise.all([
    evm ? db.from("swaps").select("traded_mint, created_at").ilike("wallet", wallet).order("created_at", { ascending: false }).limit(200)
      : db.from("swaps").select("traded_mint, created_at").eq("wallet", wallet).order("created_at", { ascending: false }).limit(200),
    evm ? Promise.resolve({ data: [] }) : db.from("token_trades").select("token_id, ts").eq("wallet", wallet).order("ts", { ascending: false }).limit(200),
    evm ? db.from("arc_trades").select("curve, ts").ilike("trader", wallet).order("ts", { ascending: false }).limit(200) : Promise.resolve({ data: [] }),
  ]);
  const recent = new Map<string, number>();
  for (const s of (sw ?? []) as { traded_mint: string | null; created_at: string }[]) if (s.traded_mint && !recent.has(s.traded_mint)) recent.set(s.traded_mint, Date.parse(s.created_at));
  // Lancements OM : on retrouve le mint du token
  const ids = [...new Set(((tt ?? []) as { token_id: string }[]).map((r) => r.token_id))].slice(0, 30);
  const curves = [...new Set(((at ?? []) as { curve: string }[]).map((r) => r.curve.toLowerCase()))].slice(0, 30);
  if (ids.length || curves.length) {
    const q = db.from("launchpad_tokens").select("id, mint_address, arc_launch_id, updated_at");
    const { data: toks } = ids.length ? await q.in("id", ids) : await q.in("arc_launch_id", curves);
    for (const t of (toks ?? []) as { mint_address: string | null; updated_at: string }[]) if (t.mint_address && !recent.has(t.mint_address)) recent.set(t.mint_address, Date.parse(t.updated_at ?? "0"));
  }
  const mints = [...recent.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m).slice(0, 12);
  const cards = await Promise.all(mints.map((m) => getTradeCard(wallet, m).catch(() => null)));
  const positions = cards.filter((c): c is NonNullable<typeof c> => !!c).map((c) => ({
    mint: c.mint, chain: c.chain, symbol: c.symbol, logo: c.logo, open: c.open, value: c.value, pnl: c.pnl, pct: c.pct, bought: c.bought, lastAt: c.lastAt,
  })).sort((a, b) => Number(b.open) - Number(a.open) || b.lastAt - a.lastAt);
  return NextResponse.json({ positions });
}
