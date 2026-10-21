/** POST /api/social/trade-attribution { postId } — le trader (connecté) ouvre le bouton Trade d'un post. */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { registerTradeAttribution } from "@/lib/trade-rewards";

export async function POST(req: Request) {
  const who = await requireWallet();
  if ("error" in who) return who.error;
  const { postId } = (await req.json().catch(() => ({}))) as { postId?: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ok = await registerTradeAttribution(createAdminClient() as any, postId, who.wallet);
  return NextResponse.json({ ok });
}
