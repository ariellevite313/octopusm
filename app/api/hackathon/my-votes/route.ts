/** GET /api/hackathon/my-votes : les votes du wallet connecté (le wallet vient de la session). */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { loadMyVotes } from "@/lib/hackathon/my-votes";

export const dynamic = "force-dynamic";

export async function GET() {
  const who = await requireWallet();
  if ("error" in who) return who.error;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return NextResponse.json(await loadMyVotes(createAdminClient() as any, who.wallet));
  } catch (e) {
    console.error("[hackathon/my-votes]", e);
    return NextResponse.json({ error: "Could not load your votes" }, { status: 500 });
  }
}
