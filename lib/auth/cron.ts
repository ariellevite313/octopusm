import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

/**
 * Garde des routes cron : refuse tout appel sans le bon secret bearer.
 * Si CRON_SECRET n'est pas défini, la route est fermée (503) au lieu d'être ouverte à tous.
 * Retourne null si l'appel est autorisé, sinon la réponse à renvoyer.
 */
export function cronDenied(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
