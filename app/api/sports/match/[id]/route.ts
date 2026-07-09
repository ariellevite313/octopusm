/**
 * GET /api/sports/match/[id]
 *
 * Proxy sécurisé vers worldcup26.ir.
 *
 * Sécurité :
 *  - Validation stricte : id doit être un entier 1–104, rien d'autre
 *  - Le JWT WORLDCUP_API_TOKEN n'est jamais exposé au client
 *  - Seuls les champs nécessaires sont retournés (pas de réponse brute)
 *  - Cache serveur 60 s (via lib/worldcup/client.ts)
 *  - En-tête Cache-Control public 60 s pour CDN/browser
 */

import { NextResponse } from "next/server";
import { getMatchScore } from "@/lib/worldcup/client";

// Pas de revalidation statique — les données live ne doivent pas être bakeées
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;

  // ── Validation stricte ────────────────────────────────────────────────────
  // On rejette tout ce qui n'est pas un entier pur entre 1 et 104.
  // Cela bloque : path traversal, injection, floats, strings, négatifs, etc.
  if (!/^\d{1,3}$/.test(rawId)) {
    return NextResponse.json({ error: "Invalid match ID" }, { status: 400 });
  }

  const matchId = parseInt(rawId, 10);

  if (matchId < 1 || matchId > 104) {
    return NextResponse.json({ error: "Match ID must be between 1 and 104" }, { status: 400 });
  }

  // ── Récupération (avec cache serveur 60 s) ────────────────────────────────
  const score = await getMatchScore(matchId);

  if (!score) {
    return NextResponse.json({ error: "Match not found or API unavailable" }, { status: 404 });
  }

  // ── Réponse filtrée — aucun champ interne de l'API externe ───────────────
  return NextResponse.json(score, {
    headers: {
      // CDN + navigateur peuvent cacher 60 s
      "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=30",
    },
  });
}
