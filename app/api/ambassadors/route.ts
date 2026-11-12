/**
 * GET  /api/ambassadors  Places prises, ma candidature, mon statut d'ambassadeur.
 * POST /api/ambassadors  Candidature (une par wallet, pendant la session ouverte) : réseaux, expérience, projet, engagements.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { requireWallet } from "@/lib/social/session";
import { normWallet } from "@/lib/social/posts";
import { moderateText } from "@/lib/moderation";
import { AMBASSADOR_MAX, AMBASSADOR_MIN_FOLLOWERS } from "@/lib/ambassadors";

export const dynamic = "force-dynamic";

export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const raw = await getWalletAddress();
  const me = raw ? normWallet(raw) : null;
  try {
    const [{ count }, app, amb, set] = await Promise.all([
      db.from("ambassadors").select("wallet", { count: "exact", head: true }).eq("active", true),
      me ? db.from("ambassador_applications").select("status, created_at").eq("wallet", me).maybeSingle() : Promise.resolve({ data: null }),
      me ? db.from("ambassadors").select("active").eq("wallet", me).maybeSingle() : Promise.resolve({ data: null }),
      db.from("ambassador_settings").select("apply_until, results_at").eq("id", 1).maybeSingle(),
    ]);
    return NextResponse.json({ taken: count ?? 0, max: AMBASSADOR_MAX, application: app.data ?? null, ambassador: !!amb.data?.active, apply_until: set.data?.apply_until ?? null, results_at: set.data?.results_at ?? null });
  } catch { return NextResponse.json({ taken: 0, max: AMBASSADOR_MAX, application: null, ambassador: false, apply_until: null, results_at: null }); }
}

const clean = (v: unknown, n: number) => String(v ?? "").replace(/[<>]/g, "").trim().slice(0, n);

export async function POST(req: Request) {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const x = clean(b.x_handle, 30).replace(/^@/, "");
  const telegram = clean(b.telegram, 40).replace(/^@/, "");
  const other_links = clean(b.other_links, 500);
  const followers = Math.max(0, Math.min(100_000_000, Math.floor(Number(b.followers) || 0)));
  const country = clean(b.country, 40), language = clean(b.language, 40), crypto_since = clean(b.crypto_since, 40);
  const communities = clean(b.communities, 800), events = clean(b.events, 800), content_links = clean(b.content_links, 800), other_programs = clean(b.other_programs, 500);
  const motivation = clean(b.motivation, 1000);
  const target_month = Math.max(0, Math.min(1_000_000, Math.floor(Number(b.target_month) || 0)));
  if (!x || !/^[A-Za-z0-9_]{1,15}$/.test(x)) return NextResponse.json({ error: "Add a valid X account" }, { status: 400 });
  if (followers < AMBASSADOR_MIN_FOLLOWERS) return NextResponse.json({ error: `You need at least ${AMBASSADOR_MIN_FOLLOWERS} followers to apply` }, { status: 400 });
  if (motivation.length < 20) return NextResponse.json({ error: "Tell us in a few words how you will bring users" }, { status: 400 });
  if (b.accept !== true) return NextResponse.json({ error: "Accept the commitments to apply" }, { status: 400 });
  if ((await moderateText([motivation, communities, events, other_programs].join("\n"))) === "blocked") return NextResponse.json({ error: "This content goes against our rules" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  // Session ouverte ?
  const { data: set } = await db.from("ambassador_settings").select("apply_until").eq("id", 1).maybeSingle();
  if (!set?.apply_until || Date.now() > new Date(set.apply_until).getTime()) return NextResponse.json({ error: "Applications are closed" }, { status: 403 });
  const { data: cur } = await db.from("ambassador_applications").select("status").eq("wallet", s.wallet).maybeSingle();
  if (cur && cur.status !== "rejected") return NextResponse.json({ error: cur.status === "pending" ? "Your application is being reviewed" : "You already applied" }, { status: 409 });
  const n = (v: string) => v || null;
  const row = {
    wallet: s.wallet, x_handle: x, telegram: n(telegram), other_links: n(other_links), followers, country: n(country), language: n(language),
    crypto_since: n(crypto_since), communities: n(communities), events: n(events), content_links: n(content_links), other_programs: n(other_programs),
    motivation, target_month, status: "pending", created_at: new Date().toISOString(), decided_at: null, note: null,
  };
  const { error } = await db.from("ambassador_applications").upsert(row, { onConflict: "wallet" });
  if (error) return NextResponse.json({ error: "Could not send your application" }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
