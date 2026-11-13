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
import { verifyMessage } from "viem";
import { isEvmChain, isAddr } from "@/lib/swap/evm";
import { evmHolding, refMessage } from "@/lib/swap/chill-evm";
import { CHILL_MIN_USD, CHILL_POSTS_PER_DAY } from "@/lib/swap/chill";

export async function POST(req: Request) {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  const b = (await req.json().catch(() => ({}))) as { mint?: unknown; body?: unknown; chain?: unknown; holder?: unknown; signature?: unknown; nonce?: unknown };
  if (isEvmChain(b.chain)) return postEvm(s.wallet, b as { mint?: unknown; body?: unknown; chain: string; holder?: unknown; signature?: unknown; nonce?: unknown });
  if (s.wallet.startsWith("0x")) return NextResponse.json({ error: "Pick an EVM network to show a bag from this wallet" }, { status: 400 });
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

/** Sac sur un réseau EVM : le détenteur est le wallet EVM de la session, ou un wallet EVM relié qui signe un message. */
async function postEvm(sessionWallet: string, b: { mint?: unknown; body?: unknown; chain: string; holder?: unknown; signature?: unknown; nonce?: unknown }) {
  const chain = b.chain as import("@/lib/swap/evm").EvmChain;
  const token = typeof b.mint === "string" ? b.mint.toLowerCase() : "";
  const text = typeof b.body === "string" ? b.body.replace(/\r\n?/g, "\n").trim().slice(0, 1000) : "";
  if (!isAddr(token)) return NextResponse.json({ error: "Pick a token from your bags" }, { status: 400 });
  const holder = (sessionWallet.startsWith("0x") ? sessionWallet : typeof b.holder === "string" ? b.holder : "").toLowerCase();
  if (!isAddr(holder)) return NextResponse.json({ error: "Connect an EVM wallet" }, { status: 400 });
  if (!sessionWallet.startsWith("0x")) {
    // Compte Solana : le wallet EVM prouve qu'il est à la personne en signant un message à usage unique
    const nonce = typeof b.nonce === "string" ? b.nonce.slice(0, 40) : "";
    const ts = Number(nonce.split("-")[0]);
    if (!nonce || !Number.isFinite(ts) || Math.abs(Date.now() - ts) > 10 * 60_000 || typeof b.signature !== "string") return NextResponse.json({ error: "Sign the message in your wallet" }, { status: 400 });
    const ok = await verifyMessage({ address: holder as `0x${string}`, message: refMessage(chain, token, nonce), signature: b.signature as `0x${string}` }).catch(() => false);
    if (!ok) return NextResponse.json({ error: "Signature does not match this wallet" }, { status: 400 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: w } = await admin.from("wallets").select("address").eq("address", sessionWallet).maybeSingle();
  if (!w) return NextResponse.json({ error: "Wallet not registered" }, { status: 403 });
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await admin.from("posts").select("id", { count: "exact", head: true }).eq("author", sessionWallet).eq("kind", "bag").gte("created_at", since);
  if ((count ?? 0) >= CHILL_POSTS_PER_DAY) return NextResponse.json({ error: `You can show ${CHILL_POSTS_PER_DAY} bags per 24 hours` }, { status: 429 });
  const h = await evmHolding(chain, holder, token);
  if (h.usd == null) return NextResponse.json({ error: "No price for this token yet" }, { status: 400 });
  if (h.usd < CHILL_MIN_USD) return NextResponse.json({ error: `Hold at least $${CHILL_MIN_USD} of this token to show it` }, { status: 400 });
  if (text && (await moderateText(text)) === "blocked") return NextResponse.json({ error: "This post goes against our rules" }, { status: 400 });
  const symbol = h.meta?.symbol || token.slice(2, 6);
  const { data, error } = await admin.from("posts").insert({
    author: sessionWallet, kind: "bag", body: text || `$${symbol}`, images: [], images_checked: true,
    bag_mint: token, bag_symbol: symbol, bag_name: (h.meta?.name || symbol).slice(0, 40), bag_logo: h.meta?.logo ?? null, bag_chain: chain, bag_holder: holder,
  }).select("id").single();
  if (error) { console.error("[chill evm]", error.message); return NextResponse.json({ error: "Could not publish" }, { status: 500 }); }
  return NextResponse.json({ id: data.id });
}
