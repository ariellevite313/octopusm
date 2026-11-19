/** GET /api/terminal/activity?mint=&from=YYYY-MM-DD&to=YYYY-MM-DD&who=all|you|janus&limit= : mon activité et celle de mon Janus */
import { NextResponse } from "next/server";
import { requireWallet } from "@/lib/social/session";
import { createAdminClient } from "@/lib/supabase/server";
import { getActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const s = await requireWallet();
  if ("error" in s) return s.error;
  const u = new URL(req.url).searchParams;
  const mint = u.get("mint");
  const who = u.get("who");
  const items = await getActivity(createAdminClient(), s.wallet, {
    mint: mint && /^([1-9A-HJ-NP-Za-km-z]{32,44}|0x[0-9a-fA-F]{40})$/.test(mint) ? mint : null,
    from: DAY.test(u.get("from") ?? "") ? u.get("from") : null, to: DAY.test(u.get("to") ?? "") ? u.get("to") : null,
    who: who === "you" || who === "janus" ? who : "all", limit: Number(u.get("limit")) || 90,
  }).catch(() => []);
  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}
