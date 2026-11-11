/**
 * POST /api/chill { mint, body } : « Chill ton sac ». Publie un post qui montre un token détenu (au moins 1 $, vérifié
 * sur la chaîne). Les achats et ventes faits depuis ce post paient 0,3 % de frais OM, dont 40 % pour l'auteur
 * (tokens OM compris : sur la courbe comme après la graduation).
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { moderateText } from "@/lib/moderation";
import { jupTokens } from "@/lib/bags";
import { SOL_MINT, USDC_MINT, isMint } from "@/lib/swap/core";
import { holdingUsd } from "@/lib/swap/chill-server";
import { CHILL_MIN_USD, CHILL_POSTS_PER_DAY } from "@/lib/swap/chill";

export async function POST(req: Request) {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  if (s.wallet.startsWith("0x")) return NextResponse.json({ error: "Connect a Solana wallet" }, { status: 400 });
  const b = (await req.json().catch(() => ({}))) as { mint?: unknown; body?: unknown };
  const mint = typeof b.mint === "string" ? b.mint : "";
  const text = typeof b.body === "string" ? b.body.replace(/\r\n?/g, "\n").trim().slice(0, 1000) : "";
  if (!isMint(mint) || mint === SOL_MINT || mint === USDC_MINT) return NextResponse.json({ error: "Pick a token from your bags" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: w } = await admin.from("wallets").select("address").eq("address", s.wallet).maybeSingle();
  if (!w) return NextResponse.json({ error: "Wallet not registered" }, { status: 403 });
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await admin.from("posts").select("id", { count: "exact", head: true }).eq("author", s.wallet).eq("kind", "bag").gte("created_at", since);
  if ((count ?? 0) >= CHILL_POSTS_PER_DAY) return NextResponse.json({ error: `You can show ${CHILL_POSTS_PER_DAY} bags per 24 hours` }, { status: 429 });

  const h = await holdingUsd(s.wallet, mint);
  if (h.usd == null) return NextResponse.json({ error: "No price for this token yet" }, { status: 400 });
  if (h.usd < CHILL_MIN_USD) return NextResponse.json({ error: `Hold at least $${CHILL_MIN_USD} of this token to show it` }, { status: 400 });
  if (text && (await moderateText(text)) === "blocked") return NextResponse.json({ error: "This post goes against our rules" }, { status: 400 });

  const j = (await jupTokens([mint])).get(mint);
  const { data: om } = await admin.from("launchpad_tokens").select("name, ticker, logo_url").eq("mint_address", mint).limit(1).maybeSingle();
  const symbol = (om?.ticker ?? j?.symbol ?? mint.slice(0, 4)).replace(/[^\p{L}\p{N}_.-]/gu, "").slice(0, 16) || mint.slice(0, 4);
  const icon = om?.logo_url ?? j?.icon ?? null;
  const logo = icon && /^https:\/\/[^\s"'<>]+$/i.test(icon) ? icon : null;
  const { data, error } = await admin.from("posts").insert({
    author: s.wallet, kind: "bag", body: text || `$${symbol}`, images: [], images_checked: true,
    bag_mint: mint, bag_symbol: symbol, bag_name: (om?.name ?? j?.name ?? symbol).slice(0, 40), bag_logo: logo,
  }).select("id").single();
  if (error) { console.error("[chill]", error.message); return NextResponse.json({ error: "Could not publish" }, { status: 500 }); }
  return NextResponse.json({ id: data.id });
}
