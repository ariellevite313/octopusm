/**
 * GET /api/celebrations?since=ISO : ce qui mérite une animation à l'arrivée sur OM (portefeuille connecté) :
 * bonbons reçus, Omero gagnés depuis `since`, et le niveau actuel (pour fêter un passage de niveau).
 * Lecture seule ; `since` est borné à 30 jours.
 */
import { NextResponse } from "next/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { createAdminClient } from "@/lib/supabase/server";
import { levelOfTotal } from "@/lib/octo-levels";
import { limited } from "@/lib/limit";

export const dynamic = "force-dynamic";
const isEvm = (w: string) => /^0x[0-9a-fA-F]{40}$/.test(w);

export async function GET(req: Request) {
  { const lim = await limited(req, "celebrations", 30, 60_000); if (lim) return lim; }
  const wallet = await getWalletAddress();
  if (!wallet) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const raw = Date.parse(new URL(req.url).searchParams.get("since") ?? "");
  const since = new Date(Math.max(Number.isFinite(raw) ? raw : Date.now(), Date.now() - 30 * 86_400_000)).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const by = isEvm(wallet) ? "ilike" : "eq";

  const [{ data: lb }, { data: tips }, { data: tx }] = await Promise.all([
    db.from("leaderboard_octo").select("total_octo")[by]("wallet_address", wallet).order("total_octo", { ascending: false }).limit(1).maybeSingle(),
    db.from("post_tips").select("sender, amount")[by]("recipient", wallet).gt("created_at", since).limit(2000),
    db.from("octo_transactions").select("amount, type")[by]("wallet_address", wallet).gt("created_at", since).gt("amount", 0).limit(5000),
  ]);

  const tipRows = (tips ?? []) as { sender: string; amount: number }[];
  const tipAmount = tipRows.reduce((s, t) => s + Number(t.amount || 0), 0);
  // Omero gagnés hors bonbons (les bonbons ont leur propre animation)
  const gained = ((tx ?? []) as { amount: number; type: string }[]).filter((t) => t.type !== "tip").reduce((s, t) => s + Number(t.amount || 0), 0);
  const senders = [...new Set(tipRows.map((t) => t.sender))].slice(0, 3);
  let names: { wallet: string; name: string | null; avatar: string | null }[] = [];
  if (senders.length) {
    const { data } = await db.from("wallets").select("address, display_name, avatar_src").in("address", senders);
    names = ((data ?? []) as { address: string; display_name: string | null; avatar_src: string | null }[]).map((w) => ({ wallet: w.address, name: w.display_name, avatar: w.avatar_src }));
  }
  const total = Number(lb?.total_octo ?? 0);
  return NextResponse.json({
    now: new Date().toISOString(),
    level: levelOfTotal(total),
    total,
    tips: { count: tipRows.length, amount: tipAmount, from: names, senders: new Set(tipRows.map((t) => t.sender)).size },
    gained,
  });
}
