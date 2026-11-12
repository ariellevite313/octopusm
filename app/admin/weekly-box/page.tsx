import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { WeeklyBoxPay } from "@/components/admin/admin-weekly-box-pay";
import { currentStandings } from "@/lib/weekly-box-server";
import { TOP_N } from "@/lib/weekly-box";

export const metadata: Metadata = { title: "Weekly box — Admin" };
export const dynamic = "force-dynamic";

const short = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`;
type Week = { week_start: string; winner: string | null; winner_points: number | null; prize_sol: number; prize_status: string; claimed_at: string | null; paid_at: string | null; paid_tx: string | null };
type Result = { week_start: string; wallet: string; rank: number; points: number; omero: number };

export default async function AdminWeeklyBoxPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const [{ data: w }, { data: r }, live] = await Promise.all([
    admin.from("weekly_box_weeks").select("*").order("week_start", { ascending: false }).limit(20),
    admin.from("weekly_box_results").select("*").order("week_start", { ascending: false }).order("rank").limit(200),
    currentStandings().catch(() => null),
  ]);
  const weeks = (w ?? []) as Week[];
  const results = (r ?? []) as Result[];
  const toPay = weeks.filter((x) => x.prize_status === "claimed" || x.prize_status === "won");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">Weekly box</h1>
        <p className="mt-1 text-sm text-muted-foreground">Each Monday the past week is settled: the top {TOP_N} get their points as OMERO automatically, the number 1 wins a SOL box. Pay the winner by hand once they claim, then paste the transaction.</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">To pay ({toPay.length})</h2>
        <div className="divide-y divide-border rounded-2xl border border-border bg-card">
          {toPay.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nothing to pay.</p>}
          {toPay.map((x) => (
            <div key={x.week_start} className="space-y-2 p-3 text-sm">
              <p><span className="font-semibold">Week of {x.week_start}</span> · {x.prize_sol} SOL to <span className="font-mono text-xs">{x.winner}</span> · {x.prize_status === "claimed" ? `claimed ${new Date(x.claimed_at!).toLocaleString()}` : "not claimed yet"}</p>
              {x.winner?.startsWith("0x") && <p className="text-xs text-muted-foreground">EVM wallet: ask the winner for a Solana address or pay the same value on their chain.</p>}
              <WeeklyBoxPay week={x.week_start} />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">This week (live)</h2>
        <div className="divide-y divide-border rounded-2xl border border-border bg-card">
          {!live || live.ranked.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No eligible wallet yet.</p>
            : live.ranked.slice(0, TOP_N).map((s, i) => (
              <div key={s.wallet} className="flex justify-between p-3 text-sm">
                <span><span className="mr-2 text-muted-foreground">#{i + 1}</span><span className="font-mono text-xs">{short(s.wallet)}</span></span>
                <span className="font-semibold">{s.points.toLocaleString()} pts</span>
              </div>
            ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Past weeks</h2>
        <div className="space-y-3">
          {weeks.length === 0 && <p className="text-sm text-muted-foreground">No week settled yet.</p>}
          {weeks.map((x) => (
            <div key={x.week_start} className="rounded-2xl border border-border bg-card p-3 text-sm">
              <p className="font-semibold">Week of {x.week_start} · box {x.prize_status}{x.paid_tx ? ` · tx ${short(x.paid_tx)}` : ""}</p>
              <div className="mt-2 divide-y divide-border">
                {results.filter((y) => y.week_start === x.week_start).map((y) => (
                  <div key={y.wallet} className="flex justify-between py-1.5 text-xs">
                    <span><span className="mr-2 text-muted-foreground">#{y.rank}</span><span className="font-mono">{short(y.wallet)}</span></span>
                    <span>{y.points.toLocaleString()} pts · {y.omero.toLocaleString()} OMERO</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
