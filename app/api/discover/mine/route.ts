/** GET /api/discover/mine : mes tokens OM en ligne (pour lister une app) et les fiches déjà créées. */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { APP_COLS } from "@/lib/discover-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const [{ data: toks }, { data: apps }, { data: me }] = await Promise.all([
    db.from("launchpad_tokens").select("id, ticker, name, logo_url, chain, status").ilike("creator_wallet", s.wallet).in("status", ["active", "graduating", "graduated"]).order("created_at", { ascending: false }).limit(50),
    db.from("discover_apps").select(APP_COLS).ilike("owner", s.wallet).limit(50),
    db.from("wallets").select("role").eq("address", s.wallet).maybeSingle(),
  ]);
  // Réseau et fin de période des fiches sans token (colonnes de la migration 20261219)
  const ids = ((apps ?? []) as { id: string }[]).map((a) => a.id);
  const { data: extra, error } = ids.length ? await db.from("discover_apps").select("id, network, listing_paid_until").in("id", ids) : { data: [], error: null };
  // Réseaux sociaux (migration 20261220), lus à part
  const { data: soc, error: e2 } = ids.length ? await db.from("discover_apps").select("id, x_url, telegram_url, discord_url").in("id", ids) : { data: [], error: null };
  const sx = new Map<string, Record<string, string | null>>(e2 ? [] : ((soc ?? []) as { id: string }[]).map((x) => [x.id, x as unknown as Record<string, string | null>]));
  const ex = new Map<string, { network: string | null; listing_paid_until: string | null }>(error ? [] : ((extra ?? []) as { id: string; network: string | null; listing_paid_until: string | null }[]).map((x) => [x.id, x]));
  return NextResponse.json({
    tokens: toks ?? [],
    apps: ((apps ?? []) as { id: string }[]).map((a) => ({ ...a, ...(sx.get(a.id) ?? {}), ...(ex.get(a.id) ?? {}) })),
    isAdmin: me?.role === "admin",
  });
}
