/**
 * GET /api/weekly-box : la box de la semaine.
 * Règle d'abord la semaine écoulée si besoin (top 10 en OMERO, box SOL au premier),
 * puis renvoie le classement en cours, mon score et le résultat de la semaine passée.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { getProfiles } from "@/lib/profiles";
import { normWallet } from "@/lib/social/posts";
import { currentStandings, settlePreviousWeek } from "@/lib/weekly-box-server";
import { DAILY_CAP, POINTS, PRIZE_SOL, TOP_N, isoDay, previousWeek, weekStart } from "@/lib/weekly-box";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();
  await settlePreviousWeek(now).catch((e) => console.error("[weekly-box] settle:", (e as Error).message));

  const w = await getWalletAddress();
  const me = w ? normWallet(w) : null;
   
  const admin = createAdminClient() as any;

  let st;
  try { st = await currentStandings(now); }
  catch (e) { console.error("[weekly-box] standings:", (e as Error).message); return NextResponse.json({ error: "Could not load the weekly box" }, { status: 503 }); }

  const top = st.ranked.slice(0, TOP_N);
  const lastWeek = isoDay(previousWeek(weekStart(now)));
  const [{ data: week }, { data: results }] = await Promise.all([
    admin.from("weekly_box_weeks").select("week_start, winner, winner_points, prize_sol, prize_status, claimed_at, paid_at, paid_tx").eq("week_start", lastWeek).maybeSingle(),
    admin.from("weekly_box_results").select("wallet, rank, points, omero").eq("week_start", lastWeek).order("rank"),
  ]);
  const lastRows = (results ?? []) as { wallet: string; rank: number; points: number; omero: number }[];
  const profiles = await getProfiles(admin, [...top.map((s) => s.wallet), ...lastRows.map((r) => r.wallet)]);
  const who = (wallet: string) => ({ wallet, name: profiles.get(wallet)?.name ?? null, avatar: profiles.get(wallet)?.avatar_src ?? null });

  const mine = me ? st.scores.get(me) ?? null : null;
  const myRank = me ? st.ranked.findIndex((s) => s.wallet === me) : -1;
  const myLast = me ? lastRows.find((r) => normWallet(r.wallet) === me) ?? null : null;
  const iWon = !!(me && week?.winner && normWallet(week.winner) === me);

  return NextResponse.json({
    week: { start: st.start.toISOString(), end: st.end.toISOString() },
    rules: { points: POINTS, caps: DAILY_CAP, prizeSol: PRIZE_SOL, topN: TOP_N },
    me: me ? {
      points: mine?.points ?? 0,
      counts: mine?.counts ?? {},
      eligible: mine?.eligible ?? false,
      rank: myRank >= 0 ? myRank + 1 : null,
    } : null,
    top: top.map((s, i) => ({ rank: i + 1, points: s.points, ...who(s.wallet) })),
    last: week ? {
      week: week.week_start,
      winner: week.winner ? { ...who(week.winner), points: week.winner_points } : null,
      top: lastRows.map((r) => ({ rank: r.rank, points: r.points, omero: r.omero, ...who(r.wallet) })),
      mine: myLast ? { rank: myLast.rank, points: myLast.points, omero: myLast.omero } : null,
      box: iWon ? { prizeSol: Number(week.prize_sol), status: week.prize_status, paidTx: week.paid_tx } : null,
    } : null,
  });
}
