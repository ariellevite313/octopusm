/**
 * GET /api/cron/hackathon-announcements — une fois par heure.
 * Crée les annonces dues (annonce du 23 novembre, rappel du jour, paliers, fin...). Idempotent : une annonce
 * existe une seule fois par (series, key). Sécurisé par CRON_SECRET (bearer).
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { loadBoard } from "@/lib/hackathon/leaderboard";
import { plannedAnnouncements } from "@/lib/hackathon/announcements";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  let pool = 0; let top: string | null = null;
  try { const b = await loadBoard(db); pool = b.poolUsd; top = b.rows[0]?.name ?? null; } catch { /* le rappel part sans chiffres */ }

  const plans = plannedAnnouncements(Date.now(), { poolUsd: pool, topProject: top });
  let created = 0;
  for (const p of plans) {
    const { error, data } = await db.from("announcements")
      .upsert({ series: p.series, key: p.key, template: p.template, vars: p.vars, href: p.href, publish_at: p.publishAt }, { onConflict: "series,key", ignoreDuplicates: true })
      .select("id");
    if (error) console.error("[hackathon-announcements]", error.message);
    else if ((data ?? []).length > 0) created++;
  }
  return NextResponse.json({ planned: plans.length, created });
}
