/**
 * POST /api/profile/cosmetics : animations de son propre profil.
 *   { action: "equip", frame: FrameId | null }  porte un contour (niveau atteint ou acheté) ou l'enlève
 *   { action: "buy", frame: FrameId }           achète un contour de la boutique en Omero
 *   { action: "buddies", on: boolean }          affiche ou cache les mascottes de la bannière
 */
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { requireSessionWallet } from "@/lib/social/session";
import { limited } from "@/lib/limit";
import { canUseFrame, frameOf, isFrameId } from "@/lib/profile-cosmetics";

const isEvm = (w: string) => /^0x[0-9a-fA-F]{40}$/.test(w);
const ERRORS: Record<string, [string, number]> = {
  owned: ["You already own this animation", 409],
  insufficient_balance: ["Not enough Omero", 402],
};

export async function POST(req: Request) {
  { const lim = await limited(req, "profile-cosmetics", 20, 60_000); if (lim) return lim; }
  const s = await requireSessionWallet();
  if ("error" in s) return s.error;
  const wallet = s.wallet;
  const b = (await req.json().catch(() => ({}))) as { action?: string; frame?: unknown; on?: unknown };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const by = isEvm(wallet) ? "ilike" : "eq";
  const done = (extra: Record<string, unknown> = {}) => { try { revalidatePath(`/profile/${wallet}`); } catch { /* sans effet */ } return NextResponse.json({ ok: true, ...extra }); };

  if (b.action === "buddies") {
    const { error } = await db.from("wallets").update({ profile_buddies: b.on === true })[by]("address", wallet);
    if (error) return NextResponse.json({ error: "Could not update right now" }, { status: 500 });
    return done();
  }

  if (b.action === "equip") {
    if (b.frame === null) {
      const { error } = await db.from("wallets").update({ profile_frame: null })[by]("address", wallet);
      if (error) return NextResponse.json({ error: "Could not update right now" }, { status: 500 });
      return done();
    }
    if (!isFrameId(b.frame)) return NextResponse.json({ error: "Unknown animation" }, { status: 400 });
    const frame = frameOf(b.frame)!;
    const [{ data: lb }, { data: own }] = await Promise.all([
      db.from("leaderboard_octo").select("total_octo")[by]("wallet_address", wallet).order("total_octo", { ascending: false }).limit(1).maybeSingle(),
      db.from("profile_cosmetics").select("item")[by]("wallet", wallet),
    ]);
    if (!canUseFrame(frame, Number(lb?.total_octo ?? 0), ((own ?? []) as { item: string }[]).map((x) => x.item))) {
      return NextResponse.json({ error: "This animation is locked" }, { status: 403 });
    }
    const { error } = await db.from("wallets").update({ profile_frame: frame.id })[by]("address", wallet);
    if (error) return NextResponse.json({ error: "Could not update right now" }, { status: 500 });
    return done();
  }

  if (b.action === "buy") {
    if (!isFrameId(b.frame)) return NextResponse.json({ error: "Unknown animation" }, { status: 400 });
    const frame = frameOf(b.frame)!;
    if (!("cost" in frame.unlock)) return NextResponse.json({ error: "This animation unlocks with your level" }, { status: 400 });
    const { data, error } = await db.rpc("buy_profile_item", { p_wallet: wallet, p_item: frame.id, p_cost: frame.unlock.cost });
    if (error) { console.error("[profile/cosmetics]", error.message); return NextResponse.json({ error: "Could not buy right now" }, { status: 500 }); }
    if (data?.error) { const [msg, code] = ERRORS[data.error] ?? ["Could not buy right now", 400]; return NextResponse.json({ error: msg }, { status: code }); }
    // Portée tout de suite après l'achat
    await db.from("wallets").update({ profile_frame: frame.id })[by]("address", wallet);
    return done({ balance: data.balance });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
