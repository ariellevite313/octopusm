/**
 * GET /api/cron/weekly-box : règle la semaine écoulée (top 10 en OMERO, box SOL au premier).
 * À appeler chaque lundi peu après 00:00 UTC. La page Box le fait aussi à la première visite.
 */
import { NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron";
import { settlePreviousWeek } from "@/lib/weekly-box-server";

export async function GET(req: Request) {
  const denied = cronDenied(req);
  if (denied) return denied;
  try { return NextResponse.json(await settlePreviousWeek()); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
