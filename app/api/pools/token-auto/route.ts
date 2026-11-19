/**
 * POST /api/pools/token-auto { mint }
 * Pool proposé directement sur la page d'un token : « $TOKEN atteindra X de capitalisation avant demain ? », Oui / Non,
 * avec le logo du token. Créé par le compte OMdotfun, sans frais, actif tout de suite ; un seul pool ouvert par token.
 * Les données (symbole, logo, capitalisation) viennent de DexScreener, jamais du navigateur. Résolu par l'admin, comme les autres pools.
 */
import { NextResponse } from "next/server";
import { requireWallet } from "@/lib/social/session";
import { limited } from "@/lib/limit";
import { createAdminClient } from "@/lib/supabase/server";
import { createPoolMarket } from "@/lib/market/create-pool";
import { SWAP_FEE_WALLET } from "@/lib/swap/core";
import { closeIn24h, moneyShort, nextTarget, tokenPoolTitle } from "@/lib/market/token-pool";

export const dynamic = "force-dynamic";
const ADDR = /^([1-9A-HJ-NP-Za-km-z]{32,44}|0x[0-9a-fA-F]{40})$/;
/** Pas de pool sur un token minuscule ou sans liquidité (trop facile à manipuler) */
const MIN_MCAP = 20_000, MIN_LIQ = 5_000;

type DsPair = { chainId?: string; baseToken?: { address?: string; symbol?: string }; marketCap?: number; fdv?: number; liquidity?: { usd?: number }; info?: { imageUrl?: string } };

export async function POST(req: Request) {
  { const lim = await limited(req, "token-pool", 10); if (lim) return lim; }
  const who = await requireWallet();
  if ("error" in who) return who.error;
  const b = (await req.json().catch(() => ({}))) as { mint?: string };
  const mint = String(b.mint ?? "").trim();
  if (!ADDR.test(mint)) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  // Déjà un pool ouvert sur ce token : on le renvoie
  const { data: open } = await db.from("mutuel_markets").select("slug").eq("token_mint", mint).eq("status", "active")
    .gt("betting_closes_at", new Date(Date.now() + 3_600_000).toISOString()).order("created_at", { ascending: false }).limit(1);
  if (open?.length) return NextResponse.json({ slug: open[0].slug, existing: true });

  let pairs: DsPair[] = [];
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    pairs = ((r.ok ? await r.json() : {}) as { pairs?: DsPair[] }).pairs ?? [];
  } catch { /* vide */ }
  const own = pairs.filter((p) => (p.baseToken?.address ?? "").toLowerCase() === mint.toLowerCase()).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  const p = own[0];
  const mcap = p ? (p.marketCap ?? p.fdv ?? 0) : 0;
  const liq = own.reduce((s, x) => s + (x.liquidity?.usd ?? 0), 0);
  if (!p || mcap < MIN_MCAP || liq < MIN_LIQ) return NextResponse.json({ error: "This token is too small for a prediction pool (market cap $20K and liquidity $5K minimum)" }, { status: 400 });

  const symbol = (p.baseToken?.symbol ?? "TOKEN").replace(/[^A-Za-z0-9]/g, "").slice(0, 12) || "TOKEN";
  const logo = p.info?.imageUrl && /^https:\/\//.test(p.info.imageUrl) ? p.info.imageUrl : null;
  const target = nextTarget(mcap);
  const close = closeIn24h();
  const res = await createPoolMarket(SWAP_FEE_WALLET, {
    title: tokenPoolTitle(symbol, target, close),
    description: `Resolves Yes if the market cap of $${symbol} (${mint}) reaches ${moneyShort(target)} or more on DexScreener before the close date. Otherwise No. Market cap when the pool opened: ${moneyShort(mcap)}.`,
    cover_image_src: logo,
    options: [{ label: "Yes", image_url: logo }, { label: "No" }],
    category: "crypto",
    bet_token: "usdc",
    betting_closes_at: close.toISOString(),
    creation_fee_token: "usdc",
    token_mint: mint,
  }, { mandateId: "token-auto" });
  const j = (await res.json().catch(() => ({}))) as { slug?: string; error?: string };
  if (!res.ok || !j.slug) return NextResponse.json({ error: j.error ?? "Could not open the pool" }, { status: res.status >= 400 ? res.status : 500 });
  return NextResponse.json({ slug: j.slug, existing: false });
}
