/**
 * GET  /api/admin/ambassadors  Candidatures et ambassadeurs.
 * POST /api/admin/ambassadors  { wallet, action: approve | reject | remove, community?: slug, note? }
 *                               { action: settings, apply_until, results_at }  (nouvelle session de candidatures)
 *   approve : 20 places au maximum ; community = communauté rejointe automatiquement par ses filleuls.
 */
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/server";
import { AMBASSADOR_MAX } from "@/lib/ambassadors";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const [apps, ambs, set] = await Promise.all([
    db.from("ambassador_applications").select("*").order("created_at", { ascending: false }).limit(300),
    db.from("ambassadors").select("wallet, active, community_id, approved_at"),
    db.from("ambassador_settings").select("apply_until, results_at").eq("id", 1).maybeSingle(),
  ]);
  return NextResponse.json({ applications: apps.data ?? [], ambassadors: ambs.data ?? [], max: AMBASSADOR_MAX, settings: set.data ?? null });
}

export async function POST(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const b = (await req.json().catch(() => ({}))) as { wallet?: string; action?: string; community?: string; note?: string; apply_until?: string; results_at?: string };
  // Nouvelle session : date limite et date d'annonce
  if (b.action === "settings") {
    const d = (v?: string) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db0 = createAdminClient() as any;
    const { error } = await db0.from("ambassador_settings").upsert({ id: 1, apply_until: d(b.apply_until), results_at: d(b.results_at) }, { onConflict: "id" });
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  const wallet = String(b.wallet ?? "");
  if (!wallet) return NextResponse.json({ error: "wallet required" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const now = new Date().toISOString();
  const note = b.note ? String(b.note).slice(0, 300) : null;

  if (b.action === "approve") {
    const { count } = await db.from("ambassadors").select("wallet", { count: "exact", head: true }).eq("active", true);
    if ((count ?? 0) >= AMBASSADOR_MAX) return NextResponse.json({ error: `All ${AMBASSADOR_MAX} places are taken` }, { status: 409 });
    let community_id: string | null = null;
    if (b.community) {
      const { data: c } = await db.from("communities").select("id").eq("slug", String(b.community).toLowerCase()).maybeSingle();
      if (!c) return NextResponse.json({ error: "Community not found" }, { status: 404 });
      community_id = c.id;
    }
    const { error } = await db.from("ambassadors").upsert({ wallet, active: true, community_id, approved_at: now }, { onConflict: "wallet" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await db.from("ambassador_applications").update({ status: "approved", decided_at: now, note }).eq("wallet", wallet);
    await db.from("notifications").insert({ wallet, kind: "ambassador", actor: wallet }).then(() => {}, () => {});
    return NextResponse.json({ ok: true });
  }
  if (b.action === "reject") {
    await db.from("ambassador_applications").update({ status: "rejected", decided_at: now, note }).eq("wallet", wallet);
    return NextResponse.json({ ok: true });
  }
  if (b.action === "remove") {
    await db.from("ambassadors").update({ active: false }).eq("wallet", wallet);
    await db.from("ambassador_applications").update({ status: "removed", decided_at: now, note }).eq("wallet", wallet);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
