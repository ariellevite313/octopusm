/** GET /api/pools/draft/:id → brouillon de marché proposé par une IA (lecture seule, valable 24 h). Rien n'est créé ici. */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/social/posts";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (createAdminClient() as any).from("agent_intents").select("params, status, expires_at, agent_wallet").eq("id", id).eq("kind", "create_pool").maybeSingle();
  if (!data || new Date(data.expires_at).getTime() < Date.now()) return NextResponse.json({ error: "This draft does not exist or has expired" }, { status: 404 });
  return NextResponse.json({ draft: data.params, agent: data.agent_wallet });
}
