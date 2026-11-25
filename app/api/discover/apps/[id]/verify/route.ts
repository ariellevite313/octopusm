/** POST /api/discover/apps/:id/verify { verified: boolean } : l'admin donne ou retire la puce bleue d'un projet de l'OM Store. */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { limited } from "@/lib/limit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  { const lim = await limited(req, "discover-verify", 30, 60_000); if (lim) return lim; }
  const s = await requireWallet();
  if ("error" in s) return s.error;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: me } = await db.from("wallets").select("role").eq("address", s.wallet).maybeSingle();
  if (me?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const verified = body?.verified === true;
  const { data, error } = await db.from("discover_apps").update({ verified }).eq("id", id).select("id");
  if (error) { console.error("[discover/verify]", error.message); return NextResponse.json({ error: "Could not update right now" }, { status: 500 }); }
  if (!data?.length) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  return NextResponse.json({ ok: true, verified });
}
