/**
 * GET /api/profile/levels?wallet=… : niveaux Omero (nombre de personnes par niveau), total Omero du profil,
 * animations possédées et portées. `isMe` dit si c'est le profil du visiteur (pour équiper ou acheter).
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { OCTO_TIERS } from "@/components/leaderboard/octo-tier-badge";
import { limited } from "@/lib/limit";

export const dynamic = "force-dynamic";
const isEvm = (w: string) => /^0x[0-9a-fA-F]{40}$/.test(w);
const same = (a: string, b: string) => (isEvm(a) || isEvm(b) ? a.toLowerCase() === b.toLowerCase() : a === b);
let countsCache: { at: number; v: number[] } | null = null;

export async function GET(req: Request) {
  { const lim = await limited(req, "profile-levels", 60, 60_000); if (lim) return lim; }
  const wallet = (new URL(req.url).searchParams.get("wallet") ?? "").trim();
  if (!wallet || wallet.length > 64) return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // Nombre de personnes par niveau (mis en cache 2 minutes)
  if (!countsCache || Date.now() - countsCache.at > 120_000) {
    const { data } = await db.rpc("octo_level_counts");
    const r = (Array.isArray(data) ? data[0] : data) ?? {};
    countsCache = { at: Date.now(), v: [r.blue, r.green, r.yellow, r.orange, r.red].map((x: unknown) => Number(x) || 0) };
  }

  const [{ data: lb }, { data: w }, { data: own }, me] = await Promise.all([
    db.from("leaderboard_octo").select("total_octo")[isEvm(wallet) ? "ilike" : "eq"]("wallet_address", wallet).order("total_octo", { ascending: false }).limit(1).maybeSingle(),
    db.from("wallets").select("profile_frame, profile_buddies")[isEvm(wallet) ? "ilike" : "eq"]("address", wallet).maybeSingle(),
    db.from("profile_cosmetics").select("item")[isEvm(wallet) ? "ilike" : "eq"]("wallet", wallet),
    getWalletAddress(),
  ]);
  const isMe = !!me && same(me, wallet);
  let balance: number | null = null;
  if (isMe) {
    const { data: tx } = await db.from("octo_transactions").select("amount")[isEvm(wallet) ? "ilike" : "eq"]("wallet_address", wallet).limit(50_000);
    balance = ((tx ?? []) as { amount: number }[]).reduce((s, t) => s + Number(t.amount || 0), 0);
  }
  return NextResponse.json({
    total: Number(lb?.total_octo ?? 0),
    levels: OCTO_TIERS.map((t, i) => ({ label: t.label, min: t.min, max: Number.isFinite(t.max) ? t.max : null, color: t.color, count: countsCache!.v[i] ?? 0 })),
    frame: w?.profile_frame ?? null,
    buddies: w?.profile_buddies ?? true,
    owned: ((own ?? []) as { item: string }[]).map((x) => x.item),
    isMe,
    balance,
  });
}
