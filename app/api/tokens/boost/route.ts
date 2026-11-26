/**
 * POST /api/tokens/boost  { chain, mint }
 * Met un token du Terminal dans « Tokens en tendance » du fil pendant TOKEN_BOOST_HOURS heures, payé en Omero uniquement.
 * Tout le monde peut booster n'importe quel token. Le nom et le logo sont relus côté serveur (jamais ceux du client).
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { limited } from "@/lib/limit";
import { CHAINS, solToken, type TerminalChain } from "@/lib/terminal";
import { dexSearch } from "@/lib/dexscreener";
import { SOL_MINT } from "@/lib/swap/core";
import { TOKEN_BOOST_COST_OMERO, TOKEN_BOOST_HOURS, validTokenAddress } from "@/lib/token-boost";

const ERRORS: Record<string, [string, number]> = { insufficient_balance: ["Not enough Omero", 402] };

export async function POST(req: Request) {
  { const lim = await limited(req, "token-boost", 10, 60_000); if (lim) return lim; }
  const s = await requireWallet();
  if ("error" in s) return s.error;
  const body = (await req.json().catch(() => null)) as { chain?: string; mint?: string } | null;
  const chain = String(body?.chain ?? "solana") as TerminalChain;
  const mint = String(body?.mint ?? "").trim();
  if (!CHAINS.some((c) => c.id === chain && c.ready) || !validTokenAddress(chain, mint)) return NextResponse.json({ error: "Invalid token address" }, { status: 400 });

  // Nom, ticker et logo lus côté serveur : lancement OM, SOL, sinon le marché (DexScreener)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  let meta: { symbol: string; name: string; logo: string | null } | null = null;
  const { data: lp } = await db.from("launchpad_tokens").select("ticker, name, logo_url, chain, is_hidden").ilike("mint_address", mint).maybeSingle().then((r: unknown) => r, () => ({ data: null }));
  if (lp && !lp.is_hidden && (lp.chain ?? "solana") === chain) meta = { symbol: lp.ticker, name: lp.name, logo: lp.logo_url };
  else if (chain === "solana" && mint === SOL_MINT) { const t = await solToken().catch(() => null); meta = { symbol: "SOL", name: "Solana", logo: t?.logo ?? "/chains/solana.png" }; }
  else {
    const found = (await dexSearch(mint, [chain]).catch(() => [])).find((t) => t.mint.toLowerCase() === mint.toLowerCase());
    if (found) meta = { symbol: found.symbol, name: found.name, logo: found.logo };
  }
  if (!meta) return NextResponse.json({ error: "Token not found in the Terminal" }, { status: 404 });

  const { data, error } = await db.rpc("boost_token", {
    p_wallet: s.wallet, p_chain: chain, p_mint: mint, p_symbol: meta.symbol.slice(0, 24), p_name: meta.name.slice(0, 60), p_logo: meta.logo,
    p_cost: TOKEN_BOOST_COST_OMERO, p_hours: TOKEN_BOOST_HOURS,
  });
  if (error) { console.error("[tokens/boost]", error.message); return NextResponse.json({ error: "Could not boost right now" }, { status: 500 }); }
  if (data?.error) { const [msg, code] = ERRORS[data.error] ?? ["Could not boost right now", 400]; return NextResponse.json({ error: msg }, { status: code }); }
  return NextResponse.json({ ok: true, symbol: meta.symbol, until: data.until, balance: data.balance });
}
