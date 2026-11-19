/**
 * POST /api/admin/top { source, kind, period } : calcule un classement « Top 10 », le garde (chiffres figés) et renvoie
 * son id ; l'image est /api/og/top/[id] et la page de partage /share/top/[id]. Admin seulement.
 */
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/server";
import { buildTop, devSoldOk, hasPeriod, isSource, TOP_KINDS, TOP_PERIODS, type TopKind, type TopPeriod } from "@/lib/top-lists";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const b = (await req.json().catch(() => ({}))) as { source?: string; kind?: string; period?: string };
  const source = String(b.source ?? ""), kind = String(b.kind ?? "") as TopKind;
  const period = (hasPeriod(kind) ? String(b.period ?? "day") : "day") as TopPeriod;
  if (!isSource(source) || !TOP_KINDS.includes(kind) || !TOP_PERIODS.includes(period)) return NextResponse.json({ error: "Invalid list" }, { status: 400 });
  if (kind === "dev_sold" && !devSoldOk(source)) return NextResponse.json({ error: "Team sales are only tracked on Solana" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const rows = await buildTop(db, source, kind, period, new URL(req.url).origin).catch((e) => { console.error("[admin/top]", e); return null; });
  if (!rows) return NextResponse.json({ error: "Could not build the list, try again" }, { status: 502 });
  if (rows.length === 0) return NextResponse.json({ error: "No token found for this list right now" }, { status: 404 });
  const { data, error } = await db.from("top_lists").insert({ source, kind, period, rows }).select("id").single();
  if (error) return NextResponse.json({ error: "Could not save the list" }, { status: 500 });
  return NextResponse.json({ id: data.id, count: rows.length, symbols: rows.map((r: { symbol: string }) => r.symbol) });
}
