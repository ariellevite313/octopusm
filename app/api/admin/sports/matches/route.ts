/**
 * GET /api/admin/sports/matches
 *
 * Retourne tous les matchs de la Coupe du Monde 2026 avec les noms d'équipes.
 * Réservé aux admins — vérifie le rôle via Supabase RPC is_admin().
 *
 * Sécurité :
 *  - Auth vérifiée côté serveur via get_wallet_address() + is_admin()
 *  - Le JWT worldcup26.ir n'est jamais exposé
 *  - Résultat mis en cache 1 h (planning du tournoi ne change pas)
 */

import { NextResponse } from "next/server";
import { getAllMatchesWithTeams } from "@/lib/worldcup/client";
import { requireAdminApi } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  // ── Auth admin ────────────────────────────────────────────────────────────
  const denied = await requireAdminApi();
  if (denied) return denied;

  // ── Données des matchs ────────────────────────────────────────────────────
  const matches = await getAllMatchesWithTeams();

  if (!matches.length) {
    return NextResponse.json(
      { error: "Could not fetch matches. Check WORLDCUP_API_TOKEN." },
      { status: 503 }
    );
  }

  return NextResponse.json(matches, {
    headers: {
      // Planning du tournoi = statique → cache long
      "Cache-Control": "private, max-age=3600",
    },
  });
}
