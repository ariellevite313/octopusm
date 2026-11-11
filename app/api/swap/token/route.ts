/**
 * GET /api/swap/token?mint=… : nom, logo, décimales, prix et frais d'un token Solana,
 * plus les soldes (token, SOL, USDC) du portefeuille connecté.
 */
import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { solanaConnection } from "@/lib/solana/rpc";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { createAdminClient } from "@/lib/supabase/server";
import { jupTokens } from "@/lib/bags";
import { SOL_MINT, SWAP_FEE_BPS, USDC_MINT, isMint } from "@/lib/swap/core";

export const dynamic = "force-dynamic";

async function tokenBalance(owner: PublicKey, mint: PublicKey): Promise<string> {
  const accs = await solanaConnection().getParsedTokenAccountsByOwner(owner, { mint }).catch(() => ({ value: [] }));
  let raw = 0n;
  for (const a of accs.value) raw += BigInt((a.account.data as { parsed?: { info?: { tokenAmount?: { amount?: string } } } }).parsed?.info?.tokenAmount?.amount ?? "0");
  return raw.toString();
}

export async function GET(req: Request) {
  const mint = new URL(req.url).searchParams.get("mint") ?? "";
  if (!isMint(mint)) return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  const mintPk = new PublicKey(mint);
  const conn = solanaConnection();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const [info, jup, omRes] = await Promise.all([
    conn.getParsedAccountInfo(mintPk).catch(() => null),
    jupTokens([mint]),
    db.from("launchpad_tokens").select("id, name, ticker, logo_url, price_usd").eq("mint_address", mint).limit(1).maybeSingle(),
  ]);
  const parsed = (info?.value?.data as { parsed?: { type?: string; info?: { decimals?: number } } } | undefined)?.parsed;
  if (parsed?.type !== "mint" || typeof parsed.info?.decimals !== "number") return NextResponse.json({ error: "Token not found" }, { status: 404 });
  const j = jup.get(mint);
  const om = omRes?.data as { id: string; name: string; ticker: string; logo_url: string | null; price_usd: number | null } | null;
  const logo = om?.logo_url ?? j?.icon ?? null;

  const token = {
    mint, decimals: parsed.info.decimals,
    symbol: (om?.ticker ?? j?.symbol ?? mint.slice(0, 4)).slice(0, 16),
    name: (om?.name ?? j?.name ?? mint.slice(0, 4)).slice(0, 40),
    logo: logo && (/^https:\/\//i.test(logo) || /^\/(?!\/)/.test(logo)) ? logo : null,
    price: j?.usdPrice ?? (om?.price_usd != null ? Number(om.price_usd) : null),
    om_id: om?.id ?? null,
    fee_bps: om ? 0 : SWAP_FEE_BPS,
    verified: om ? true : j?.isVerified ?? null,
  };

  let balances: { token: string; sol: string; usdc: string } | null = null;
  const w = await getWalletAddress();
  if (w && !w.startsWith("0x") && mint !== SOL_MINT) {
    const owner = new PublicKey(w);
    const [tok, lamports, usdc] = await Promise.all([
      tokenBalance(owner, mintPk), conn.getBalance(owner).catch(() => 0), tokenBalance(owner, new PublicKey(USDC_MINT)),
    ]);
    balances = { token: tok, sol: String(lamports), usdc };
  }
  return NextResponse.json({ token, balances }, { headers: { "Cache-Control": "no-store" } });
}
