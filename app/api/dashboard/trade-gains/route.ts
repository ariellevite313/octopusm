/**
 * GET /api/dashboard/trade-gains
 * Gains du wallet connecté sur les achats de tokens : depuis ses posts et par parrainage.
 * Le wallet vient de la session, jamais de la requête.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";

export const dynamic = "force-dynamic";

export type TradeGainRow = {
  id:        string;
  kind:      "post" | "referral";
  amount:    number;
  createdAt: string;
  token:     { name: string; ticker: string; logoUrl: string | null } | null;
};
export type TradeGainsResponse = { total: number; fromPosts: number; fromReferrals: number; rows: TradeGainRow[] };

export async function GET() {
  const who = await requireWallet();
  if ("error" in who) return who.error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("trade_rewards")
    .select("id, kind, amount_usdc, created_at, token_id")
    .ilike("beneficiary", who.wallet)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: "Could not load gains" }, { status: 500 });

  type R = { id: string; kind: "post" | "referral"; amount_usdc: number | string; created_at: string; token_id: string | null };
  const list = (data ?? []) as R[];

  const ids = [...new Set(list.map((r) => r.token_id).filter((x): x is string => !!x))];
  const tokens = new Map<string, { name: string; ticker: string; logoUrl: string | null }>();
  if (ids.length > 0) {
    const { data: toks } = await db.from("launchpad_tokens").select("id, name, ticker, logo_url").in("id", ids);
    for (const t of (toks ?? []) as { id: string; name: string; ticker: string; logo_url: string | null }[]) {
      tokens.set(t.id, { name: t.name, ticker: t.ticker, logoUrl: t.logo_url });
    }
  }

  let fromPosts = 0;
  let fromReferrals = 0;
  for (const r of list) {
    const a = Number(r.amount_usdc) || 0;
    if (r.kind === "post") fromPosts += a; else fromReferrals += a;
  }

  const body: TradeGainsResponse = {
    total: fromPosts + fromReferrals,
    fromPosts,
    fromReferrals,
    rows: list.slice(0, 50).map((r) => ({
      id: r.id,
      kind: r.kind,
      amount: Number(r.amount_usdc) || 0,
      createdAt: r.created_at,
      token: r.token_id ? tokens.get(r.token_id) ?? null : null,
    })),
  };
  return NextResponse.json(body);
}
