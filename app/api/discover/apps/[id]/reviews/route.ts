/** POST /api/discover/apps/:id/reviews { rating, body } : noter une app (un avis par compte, modifiable ; jamais sa propre app). */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { isBanned } from "@/lib/moderation";
import { rateHit } from "@/lib/rate-limit";
import { validateReview } from "@/lib/discover";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const s = await requireWallet();
  if ("error" in s) return s.error;
  if (await isBanned(s.wallet, true)) return NextResponse.json({ error: "This account is suspended" }, { status: 403 });
  if (!(await rateHit(`discover-review:${s.wallet}`, 20, 3_600_000))) return NextResponse.json({ error: "Too many reviews, try again later" }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  const v = validateReview(b.rating, b.body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: app } = await db.from("discover_apps").select("id, owner").eq("id", id).eq("status", "live").maybeSingle();
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const me = /^0x/i.test(s.wallet) ? s.wallet.toLowerCase() : s.wallet;
  const owner = /^0x/i.test(app.owner) ? app.owner.toLowerCase() : app.owner;
  if (me === owner) return NextResponse.json({ error: "You can't review your own app" }, { status: 400 });
  const { error } = await db.from("discover_reviews").upsert({ app_id: id, wallet: me, rating: v.rating, body: v.body, updated_at: new Date().toISOString() }, { onConflict: "app_id,wallet" });
  if (error) { console.error("[discover/reviews]", error.message); return NextResponse.json({ error: "Could not save your review" }, { status: 500 }); }
  await db.from("notifications").insert({ wallet: owner, kind: "app_review", actor: me, ref: `app:${id}`, data: { rating: v.rating, app: id } }).then(() => {}, () => {});
  return NextResponse.json({ ok: true });
}
