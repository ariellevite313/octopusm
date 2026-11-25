/** POST /api/discover/apps/:id/boost : le propriétaire met sa fiche dans « Recommandés » pour BOOST_DAYS jours, payé en Omero uniquement. */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { limited } from "@/lib/limit";
import { BOOST_COST_OMERO, BOOST_DAYS } from "@/lib/discover";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ERRORS: Record<string, [string, number]> = {
  not_found: ["Project not found", 404],
  not_owner: ["Only the owner can boost this project", 403],
  hidden: ["This project is hidden", 409],
  insufficient_balance: ["Not enough Omero", 402],
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  { const lim = await limited(req, "discover-boost", 10, 60_000); if (lim) return lim; }
  const s = await requireWallet();
  if ("error" in s) return s.error;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (createAdminClient() as any).rpc("boost_discover_app", { p_wallet: s.wallet, p_app: id, p_cost: BOOST_COST_OMERO, p_days: BOOST_DAYS });
  if (error) { console.error("[discover/boost]", error.message); return NextResponse.json({ error: "Could not boost right now" }, { status: 500 }); }
  if (data?.error) { const [msg, code] = ERRORS[data.error] ?? ["Could not boost right now", 400]; return NextResponse.json({ error: msg }, { status: code }); }
  return NextResponse.json({ ok: true, until: data.until, balance: data.balance });
}
