/** POST /api/posts/:id/tip  { amount: number, currency?: "omero" } — envoie des OMERO à l'auteur du post. */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { UUID_RE } from "@/lib/social/posts";
import { notify } from "@/lib/social/notify";
import { checkTipInput, sendTip, TIP_ERRORS } from "@/lib/social/tips";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  // L'envoyeur est toujours le compte connecté (jamais une adresse envoyée par la page). Adresses 0x en minuscules.
  const s = await requireWallet();
  if ("error" in s) return s.error;

  let body: { amount?: unknown; currency?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  const bad = checkTipInput(body.amount, body.currency);
  if (bad) return NextResponse.json({ error: TIP_ERRORS[bad].message, code: bad }, { status: TIP_ERRORS[bad].status });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const r = await sendTip(admin, s.wallet, id, body.amount as number);
    if ("error" in r) return NextResponse.json({ error: TIP_ERRORS[r.error].message, code: r.error }, { status: TIP_ERRORS[r.error].status });
    await notify([{ wallet: r.recipient, kind: "tip", actor: s.wallet, postId: id }]);
    return NextResponse.json({ ok: true, tip_total: r.post_total, balance: r.balance });
  } catch (e) {
    console.error("[tip]", e);
    return NextResponse.json({ error: "Tip failed, try again" }, { status: 500 });
  }
}
