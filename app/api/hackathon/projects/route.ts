/** GET /api/hackathon/projects : projets inscrits (publics). Jamais de wallet d'équipe ni de données privées. */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("hackathon_projects")
    .select("id, token_id, name, description, site_url, github_url, x_handle, video_url, category, status, created_at")
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: "Could not load projects" }, { status: 500 });

  const rows = (data ?? []) as { token_id: string }[];
  const ids = rows.map((r) => r.token_id);
  const tokens = new Map<string, { ticker: string; logoUrl: string | null; graduated: boolean; mint: string | null }>();
  if (ids.length > 0) {
    const { data: toks } = await db.from("launchpad_tokens").select("id, ticker, logo_url, status, mint_address").in("id", ids);
    for (const t of (toks ?? []) as { id: string; ticker: string; logo_url: string | null; status: string; mint_address: string | null }[]) {
      tokens.set(t.id, { ticker: t.ticker, logoUrl: t.logo_url, graduated: t.status === "graduated", mint: t.mint_address });
    }
  }
  return NextResponse.json({ projects: rows.map((r) => ({ ...r, token: tokens.get(r.token_id) ?? null })) });
}
