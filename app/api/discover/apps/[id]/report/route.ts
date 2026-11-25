/** POST /api/discover/apps/:id/report { reason, note? } : signaler un projet (une fois par compte, jamais le sien). */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { rateHit } from "@/lib/rate-limit";
import { REPORT_REASONS } from "@/lib/discover";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const s = await requireWallet();
  if ("error" in s) return s.error;
  if (!(await rateHit(`discover-report:${s.wallet}`, 10, 3_600_000))) return NextResponse.json({ error: "Too many reports, try again later" }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as { reason?: unknown; note?: unknown };
  if (typeof b.reason !== "string" || !(REPORT_REASONS as readonly string[]).includes(b.reason)) return NextResponse.json({ error: "Choose a reason" }, { status: 400 });
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 300) || null : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: app } = await db.from("discover_apps").select("owner").eq("id", id).maybeSingle();
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const me = /^0x/i.test(s.wallet) ? s.wallet.toLowerCase() : s.wallet;
  if (me === (/^0x/i.test(app.owner) ? app.owner.toLowerCase() : app.owner)) return NextResponse.json({ error: "You can't report your own project" }, { status: 400 });
  const { error } = await db.from("discover_reports").insert({ app_id: id, reporter: me, reason: b.reason, note });
  if (error) return NextResponse.json({ ok: true, already: true });
  return NextResponse.json({ ok: true }, { status: 201 });
}
