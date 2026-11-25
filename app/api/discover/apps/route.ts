/**
 * GET  /api/discover/apps?category=&q=&sort=top|new : les apps en vitrine (avec leur token OM).
 * POST /api/discover/apps : créer ou modifier la fiche de mon app. Il faut avoir lancé le token sur OM (wallet créateur),
 *      et l'app doit accepter ce token comme moyen de paiement.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { isBanned } from "@/lib/moderation";
import { rateHit } from "@/lib/rate-limit";
import { APP_CATEGORIES, validateApp } from "@/lib/discover";
import { APP_COLS, withTokens } from "@/lib/discover-server";

export const dynamic = "force-dynamic";
const same = (a: string, b: string) => (/^0x/i.test(a) ? a.toLowerCase() === b.toLowerCase() : a === b);

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const cat = sp.get("category"), q = (sp.get("q") ?? "").trim().slice(0, 40), sort = sp.get("sort") === "new" ? "new" : sp.get("sort") === "boosted" ? "boosted" : "top";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  let query = db.from("discover_apps").select(APP_COLS).eq("status", "live").limit(60);
  if (cat && (APP_CATEGORIES as readonly string[]).includes(cat)) query = query.eq("category", cat);
  if (q) query = query.or(`name.ilike.%${q.replace(/[%_,().]/g, "")}%,tagline.ilike.%${q.replace(/[%_,().]/g, "")}%`);
  // Recommandés : seulement les fiches dont le boost (payé en Omero) court encore
  if (sort === "boosted") query = query.gt("boosted_until", new Date().toISOString()).order("boosted_until", { ascending: false });
  else query = sort === "new" ? query.order("created_at", { ascending: false }) : query.order("rating_avg", { ascending: false }).order("rating_count", { ascending: false });
  const { data, error } = await query;
  if (error) return NextResponse.json({ apps: [] });
  return NextResponse.json({ apps: (await withTokens(db, data ?? [])).map((x) => x.card) });
}

export async function POST(req: Request) {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  if (await isBanned(s.wallet, true)) return NextResponse.json({ error: "This account is suspended" }, { status: 403 });
  if (!(await rateHit(`discover-app:${s.wallet}`, 10, 3_600_000))) return NextResponse.json({ error: "Too many changes, try again later" }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const v = validateApp(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: tok } = await db.from("launchpad_tokens").select("id, status, creator_wallet").eq("id", v.value.tokenId).maybeSingle();
  if (!tok) return NextResponse.json({ error: "Launch your token on OM first" }, { status: 404 });
  if (!same(String(tok.creator_wallet ?? ""), s.wallet)) return NextResponse.json({ error: "Only the wallet that launched this token can list its app" }, { status: 403 });
  if (!["active", "graduating", "graduated"].includes(tok.status)) return NextResponse.json({ error: "Your token is not live yet" }, { status: 409 });
  const row = {
    token_id: v.value.tokenId, owner: s.wallet, name: v.value.name, tagline: v.value.tagline, description: v.value.description, category: v.value.category,
    site_url: v.value.siteUrl, icon_url: v.value.iconUrl, banner_url: v.value.bannerUrl, screenshots: v.value.screenshots, payment_note: v.value.paymentNote,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await db.from("discover_apps").upsert(row, { onConflict: "token_id" }).select("id").single();
  if (error) { console.error("[discover/apps]", error.message); return NextResponse.json({ error: "Could not save your app" }, { status: 500 }); }
  return NextResponse.json({ ok: true, id: data.id });
}
