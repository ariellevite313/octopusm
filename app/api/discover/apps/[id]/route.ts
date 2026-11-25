/** GET /api/discover/apps/:id : la fiche complète, la répartition des notes, les derniers avis et mon avis. */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { getProfiles } from "@/lib/profiles";
import { ratingBars } from "@/lib/discover";
import { APP_COLS, withTokens } from "@/lib/discover-server";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: app } = await db.from("discover_apps").select(APP_COLS).eq("id", id).eq("status", "live").maybeSingle();
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [{ card, row }] = await withTokens(db, [app]);
  const me = await getWalletAddress();
  // Réseaux sociaux : lus à part pour ne rien casser si la colonne manque encore
  const { data: soc } = await db.from("discover_apps").select("x_url, telegram_url, discord_url").eq("id", id).maybeSingle();
  const [{ data: all }, { data: similar }] = await Promise.all([
    db.from("discover_reviews").select("wallet, rating, body, created_at").eq("app_id", id).eq("hidden", false).order("created_at", { ascending: false }).limit(500),
    db.from("discover_apps").select(APP_COLS).eq("status", "live").eq("category", row.category).neq("id", id).order("rating_avg", { ascending: false }).limit(8),
  ]);
  const reviews = (all ?? []) as { wallet: string; rating: number; body: string | null; created_at: string }[];
  const shown = reviews.filter((r) => r.body).slice(0, 30);
  const profiles = await getProfiles(db, [row.owner, ...shown.map((r) => r.wallet)]);
  const mine = me ? reviews.find((r) => (/^0x/i.test(me) ? r.wallet.toLowerCase() === me.toLowerCase() : r.wallet === me)) ?? null : null;
  return NextResponse.json({
    app: { ...card, description: row.description, screenshots: row.screenshots ?? [], paymentNote: row.payment_note, socials: { x: soc?.x_url ?? null, telegram: soc?.telegram_url ?? null, discord: soc?.discord_url ?? null }, owner: { wallet: row.owner, name: profiles.get(row.owner)?.name ?? null } },
    bars: ratingBars(reviews.map((r) => r.rating)),
    reviews: shown.map((r) => ({ wallet: r.wallet, name: profiles.get(r.wallet)?.name ?? null, avatar: profiles.get(r.wallet)?.avatar_src ?? null, rating: r.rating, body: r.body, at: r.created_at })),
    mine: mine ? { rating: mine.rating, body: mine.body } : null,
    isOwner: !!me && (/^0x/i.test(me) ? me.toLowerCase() === row.owner.toLowerCase() : me === row.owner),
    similar: (await withTokens(db, similar ?? [])).map((x) => x.card),
  });
}
