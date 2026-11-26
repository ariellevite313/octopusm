/** POST /api/discover/apps/:id/boost : le propriétaire met sa fiche dans « Recommandés » pour BOOST_DAYS jours, payé en Omero uniquement. */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { limited } from "@/lib/limit";
import { BOOST_COST_OMERO, BOOST_DAYS } from "@/lib/discover";
import { crownBoostCost, hasCrown } from "@/lib/top-earner";

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
  const db = createAdminClient() as any;
  // Couronne (top 5 des gains) : -30 % sur le boost
  const cost = crownBoostCost(BOOST_COST_OMERO, await hasCrown(db, s.wallet).catch(() => false));
  const { data, error } = await db.rpc("boost_discover_app", { p_wallet: s.wallet, p_app: id, p_cost: cost, p_days: BOOST_DAYS });
  if (error) { console.error("[discover/boost]", error.message); return NextResponse.json({ error: "Could not boost right now" }, { status: 500 }); }
  if (data?.error) { const [msg, code] = ERRORS[data.error] ?? ["Could not boost right now", 400]; return NextResponse.json({ error: msg }, { status: code }); }
  return NextResponse.json({ ok: true, until: data.until, balance: data.balance });
}
