/** POST /api/discover/apps/:id/visit : compte une visite (page du projet ouverte ou site ouvert). Une par adresse IP et par heure. */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { limited } from "@/lib/limit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false }, { status: 404 });
  const lim = await limited(req, `discover-visit:${id}`, 1, 3_600_000);
  if (lim) return NextResponse.json({ ok: true, counted: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (createAdminClient() as any).rpc("discover_visit", { p_id: id }).then(() => {}, () => {});
  return NextResponse.json({ ok: true, counted: true });
}
