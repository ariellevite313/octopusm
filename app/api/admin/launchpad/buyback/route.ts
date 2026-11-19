/**
 * POST /api/admin/launchpad/buyback { tokenId, amountSol }
 * Rachète un token OM (Solana) avec le wallet de la plateforme puis détruit les tokens achetés. Admin seulement.
 * GET ?tokenId= : historique des rachats de ce token.
 */
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/server";
import { buybackAndBurn, BUYBACK_MAX_SOL } from "@/lib/buyback";
import { getWalletAddress } from "@/lib/auth/get-wallet";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const tokenId = new URL(req.url).searchParams.get("tokenId") ?? "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db.from("token_buybacks").select("id, sol_spent, burned_raw, decimals, swap_sig, burn_sig, created_at").eq("token_id", tokenId).order("created_at", { ascending: false }).limit(20);
  return NextResponse.json({ buybacks: data ?? [] });
}

export async function POST(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const b = (await req.json().catch(() => ({}))) as { tokenId?: string; amountSol?: number };
  const amount = Number(b.amountSol);
  if (!b.tokenId || !(amount > 0) || amount > BUYBACK_MAX_SOL) return NextResponse.json({ error: `Amount must be between 0 and ${BUYBACK_MAX_SOL} SOL` }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: t } = await db.from("launchpad_tokens").select("id, mint_address, chain, status").eq("id", b.tokenId).maybeSingle();
  if (!t?.mint_address || (t.chain && t.chain !== "solana")) return NextResponse.json({ error: "Solana OM token only" }, { status: 400 });
  try {
    const r = await buybackAndBurn(t.mint_address, BigInt(Math.round(amount * 1e9)));
    await db.from("token_buybacks").insert({
      token_id: t.id, mint: t.mint_address, sol_spent: amount, burned_raw: r.burned, decimals: r.decimals,
      swap_sig: r.swapSig, burn_sig: r.burnSig, created_by: await getWalletAddress().catch(() => null),
    }).then(() => {}, () => {});
    return NextResponse.json(r);
  } catch (e) {
    const m = (e as Error).message ?? "Buyback failed";
    console.error("[admin/buyback]", m);
    return NextResponse.json({ error: m.slice(0, 200) }, { status: 400 });
  }
}
