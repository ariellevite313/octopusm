/**
 * GET /api/bags/token?mint=… : fiche d'un token du portefeuille (Solana).
 * Marché (pool, prix, cap., volume, liquidité, liens) depuis DexScreener, et l'activité du portefeuille
 * connecté sur ce token via OM (table swaps). Lecture seule.
 */
import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { solanaConnection } from "@/lib/solana/rpc";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { createAdminClient } from "@/lib/supabase/server";
import { SOL_MINT, USDC_MINT, isMint } from "@/lib/swap/core";
import { isAddr, isEvmChain } from "@/lib/swap/evm";
import { DS_EVM } from "@/lib/swap/chill-evm";

export const dynamic = "force-dynamic";

type Pair = {
  pairAddress?: string; priceUsd?: string; marketCap?: number; fdv?: number; liquidity?: { usd?: number }; volume?: { h24?: number };
  priceChange?: { h24?: number }; info?: { websites?: { label?: string; url?: string }[]; socials?: { type?: string; url?: string }[] };
};

const https = (u: unknown) => (typeof u === "string" && /^https:\/\/[^\s"'<>]+$/i.test(u) ? u : null);

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const mint = sp.get("mint") ?? "";
  const evmChain = sp.get("chain");
  if (isEvmChain(evmChain) && isAddr(mint)) {
    // Token EVM : marché seul (DexScreener)
    try {
      const r = await fetch(`https://api.dexscreener.com/tokens/v1/${DS_EVM[evmChain]}/${mint}`, { signal: AbortSignal.timeout(6000), cache: "no-store" });
      const best = (((r.ok ? await r.json() : []) as Pair[]) ?? []).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
      if (best) return NextResponse.json({ market: { pool: best.pairAddress ?? null, price: best.priceUsd ? Number(best.priceUsd) : null, change24h: best.priceChange?.h24 ?? null, mcap: best.marketCap ?? best.fdv ?? null, volume24h: best.volume?.h24 ?? null, liquidity: best.liquidity?.usd ?? null, links: [] }, activity: [] });
    } catch { /* marché indisponible */ }
    return NextResponse.json({ market: null, activity: [] });
  }
  if (!isMint(mint)) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  let market: Record<string, unknown> = { pool: null, price: null, change24h: null, mcap: null, volume24h: null, liquidity: null, links: [] };
  try {
    const r = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${mint}`, { signal: AbortSignal.timeout(6000), cache: "no-store" });
    const pairs = (r.ok ? await r.json() : []) as Pair[];
    const best = [...(pairs ?? [])].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    if (best) {
      const links: { type: string; url: string }[] = [];
      for (const w of best.info?.websites ?? []) { const u = https(w.url); if (u) links.push({ type: "website", url: u }); }
      for (const s of best.info?.socials ?? []) {
        const u = https(s.url);
        const type = s.type === "twitter" ? "x" : s.type;
        if (u && type && ["x", "discord", "telegram"].includes(type)) links.push({ type, url: u });
      }
      market = {
        pool: best.pairAddress ?? null, price: best.priceUsd ? Number(best.priceUsd) : null, change24h: best.priceChange?.h24 ?? null,
        mcap: best.marketCap ?? best.fdv ?? null, volume24h: best.volume?.h24 ?? null, liquidity: best.liquidity?.usd ?? null,
        links: links.slice(0, 6),
      };
    }
  } catch { /* marché indisponible : la fiche reste lisible */ }

  // Pas de paire DexScreener (aucun volume) : on garde un prix grace a Jupiter, sinon au prix OM du token
  if (market.price == null) {
    try {
      const { jupTokens } = await import("@/lib/bags");
      const p = (await jupTokens([mint])).get(mint)?.usdPrice ?? null;
      if (p && p > 0) market = { ...market, price: p };
      else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: om } = await (createAdminClient() as any).from("launchpad_tokens").select("price_usd").eq("mint_address", mint).maybeSingle();
        const op = om?.price_usd != null ? Number(om.price_usd) : null;
        if (op && op > 0) market = { ...market, price: op };
      }
    } catch { /* prix indisponible */ }
  }

  // Activité du portefeuille connecté sur ce token (swaps passés par OM)
  let activity: { sig: string; side: string; base: string; base_amount: number; token_amount: number; at: string }[] = [];
  const w = await getWalletAddress();
  if (w && !w.startsWith("0x")) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { data } = await db.from("swaps").select("signature, side, input_mint, output_mint, in_amount, out_amount, created_at")
      .eq("wallet", w).eq("traded_mint", mint).order("created_at", { ascending: false }).limit(20);
    if (data?.length) {
      const info = await solanaConnection().getParsedAccountInfo(new PublicKey(mint)).catch(() => null);
      const dec = (info?.value?.data as { parsed?: { info?: { decimals?: number } } } | undefined)?.parsed?.info?.decimals ?? 6;
      activity = (data as { signature: string; side: string; input_mint: string; output_mint: string; in_amount: string; out_amount: string; created_at: string }[]).map((s) => {
        const baseMint = s.side === "buy" ? s.input_mint : s.output_mint;
        const baseDec = baseMint === SOL_MINT ? 9 : baseMint === USDC_MINT ? 6 : 6;
        const baseRaw = Number(s.side === "buy" ? s.in_amount : s.out_amount);
        const tokRaw = Number(s.side === "buy" ? s.out_amount : s.in_amount);
        return { sig: s.signature, side: s.side, base: baseMint === SOL_MINT ? "SOL" : "USDC", base_amount: baseRaw / 10 ** baseDec, token_amount: tokRaw / 10 ** dec, at: s.created_at };
      });
    }
  }
  return NextResponse.json({ market, activity }, { headers: { "Cache-Control": "no-store" } });
}
