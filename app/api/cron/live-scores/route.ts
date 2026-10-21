/**
 * GET /api/cron/live-scores — à appeler chaque minute (cron du serveur).
 * Interroge les fournisseurs de scores selon leur rythme et leur quota, avec bascule automatique.
 * Variables d'env : CRON_SECRET (bearer, optionnel), APISPORTS_KEY, FOOTBALL_DATA_TOKEN, WORLDCUP_API_TOKEN.
 */
import { NextResponse } from "next/server";
import { refreshLiveScores } from "@/lib/sports/live";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await refreshLiveScores());
  } catch (e) {
    console.error("[cron/live-scores]", e);
    return NextResponse.json({ error: "refresh failed" }, { status: 500 });
  }
}
