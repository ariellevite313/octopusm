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
import { createClient } from "@/lib/supabase/server";
import { getAllMatchesWithTeams } from "@/lib/worldcup/client";

export const dynamic = "force-dynamic";

export async function GET() {
  // ── Auth admin ────────────────────────────────────────────────────────────
  const supabase = await createClient();

  const { data: walletData } = await supabase.rpc("get_wallet_address");
  if (!walletData) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
