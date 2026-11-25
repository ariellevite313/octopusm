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
import { APP_CATEGORIES, NO_TOKEN_PRICE_USD, NO_TOKEN_DAYS, validateApp } from "@/lib/discover";
import { verifyTokenTransfer } from "@/lib/solana/verify-transfer";
import { APP_COLS, LIVE_LISTING, withTokens } from "@/lib/discover-server";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIG = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;
const same = (a: string, b: string) => (/^0x/i.test(a) ? a.toLowerCase() === b.toLowerCase() : a === b);

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const cat = sp.get("category"), q = (sp.get("q") ?? "").trim().slice(0, 40), sort = sp.get("sort") === "new" ? "new" : sp.get("sort") === "boosted" ? "boosted" : "top";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  // Sans la migration 20261219, le filtre des fiches payées n'existe pas : on liste sans lui
  const { error: colErr } = await db.from("discover_apps").select("listing_paid_until").limit(1);
  let query = db.from("discover_apps").select(APP_COLS).eq("status", "live").limit(60);
  if (!colErr) query = query.or(LIVE_LISTING());
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
  const base = {
    owner: s.wallet, name: v.value.name, tagline: v.value.tagline, description: v.value.description, category: v.value.category,
    site_url: v.value.siteUrl, icon_url: v.value.iconUrl, banner_url: v.value.bannerUrl, screenshots: v.value.screenshots,
    updated_at: new Date().toISOString(),
  };

  // ── Fiche avec un token OM (gratuite pour l'instant) ──
  if (v.value.tokenId) {
    const { data: tok } = await db.from("launchpad_tokens").select("id, status, creator_wallet").eq("id", v.value.tokenId).maybeSingle();
    if (!tok) return NextResponse.json({ error: "Launch your token on OM first" }, { status: 404 });
    if (!same(String(tok.creator_wallet ?? ""), s.wallet)) return NextResponse.json({ error: "Only the wallet that launched this token can list its app" }, { status: 403 });
    if (!["active", "graduating", "graduated"].includes(tok.status)) return NextResponse.json({ error: "Your token is not live yet" }, { status: 409 });
    const row = { ...base, token_id: v.value.tokenId, payment_note: v.value.paymentNote, network: null };
    const { data, error } = await db.from("discover_apps").upsert(row, { onConflict: "token_id" }).select("id").single();
    if (error) { console.error("[discover/apps]", error.message); return NextResponse.json({ error: "Could not save your app" }, { status: 500 }); }
    return NextResponse.json({ ok: true, id: data.id });
  }

  // ── Fiche sans token : libre pour l'admin, sinon 80 $ en USDC pour un an ──
  const { data: me } = await db.from("wallets").select("role").eq("address", s.wallet).maybeSingle();
  const isAdmin = me?.role === "admin";
  const appId = typeof body.appId === "string" && UUID.test(body.appId) ? body.appId : null;
  let existing: { id: string; owner: string; listing_paid_until: string | null } | null = null;
  if (appId) {
    const { data: ex } = await db.from("discover_apps").select("id, owner, listing_paid_until").eq("id", appId).is("token_id", null).maybeSingle();
    if (!ex || !same(String(ex.owner), s.wallet)) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    existing = ex;
  }
  let paidUntil: string | null = existing?.listing_paid_until ?? null;
  const stillPaid = !!paidUntil && new Date(paidUntil).getTime() > Date.now();
  let paymentTx: string | null = null;
  if (!isAdmin && !stillPaid) {
    paymentTx = typeof body.paymentTx === "string" && SIG.test(body.paymentTx) ? body.paymentTx : null;
    if (!paymentTx) return NextResponse.json({ error: `Listing without a token costs $${NO_TOKEN_PRICE_USD}`, price: NO_TOKEN_PRICE_USD }, { status: 402 });
    const { data: used } = await db.from("discover_listing_payments").select("tx").eq("tx", paymentTx).maybeSingle();
    if (used) return NextResponse.json({ error: "This payment was already used" }, { status: 409 });
    const bad = await verifyTokenTransfer(paymentTx, "usdc", NO_TOKEN_PRICE_USD, s.wallet);
    if (bad) return NextResponse.json({ error: "Payment not found. Wait a few seconds and try again" }, { status: 402 });
    const { error: payErr } = await db.from("discover_listing_payments").insert({ tx: paymentTx, wallet: s.wallet, amount_usd: NO_TOKEN_PRICE_USD });
    if (payErr) return NextResponse.json({ error: "This payment was already used" }, { status: 409 });
    paidUntil = new Date(Date.now() + NO_TOKEN_DAYS * 86_400_000).toISOString();
  }
  const row = { ...base, token_id: null, payment_note: null, network: v.value.network, listing_paid_until: isAdmin ? null : paidUntil };
  const res = existing
    ? await db.from("discover_apps").update(row).eq("id", existing.id).select("id").single()
    : await db.from("discover_apps").insert(row).select("id").single();
  if (res.error) { console.error("[discover/apps]", res.error.message); return NextResponse.json({ error: "Could not save your app" }, { status: 500 }); }
  if (paymentTx) await db.from("discover_listing_payments").update({ app_id: res.data.id }).eq("tx", paymentTx);
  return NextResponse.json({ ok: true, id: res.data.id });
}
