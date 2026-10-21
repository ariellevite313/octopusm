import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { AdminAction } from "@/components/admin/admin-actions";

export const metadata: Metadata = { title: "Rewards — Admin" };
export const revalidate = 0;

const short = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`;
const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;

type Trade = { id: string; kind: string; beneficiary: string; trader: string; chain: string; volume_usd: number; platform_fee_usd: number; amount_usdc: number; created_at: string };
type Share = { id: string; sharer: string; market_kind: string; amount_usdc: number; amount_clt: number; omero: number; created_at: string };

export default async function AdminRewardsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const [{ data: t }, { data: s }] = await Promise.all([
    admin.from("trade_rewards").select("id, kind, beneficiary, trader, chain, volume_usd, platform_fee_usd, amount_usdc, created_at").order("created_at", { ascending: false }).limit(300),
    admin.from("share_rewards").select("id, sharer, market_kind, amount_usdc, amount_clt, omero, created_at").order("created_at", { ascending: false }).limit(300),
  ]);
  const trades = (t ?? []) as Trade[];
  const shares = (s ?? []) as Share[];
  const sum = (k: "referral" | "post") => trades.filter((x) => x.kind === k).reduce((a, x) => a + Number(x.amount_usdc), 0);
  const fees = trades.reduce((a, x) => a + Number(x.platform_fee_usd), 0);
  const top = new Map<string, number>();
  for (const x of trades) top.set(x.beneficiary, (top.get(x.beneficiary) ?? 0) + Number(x.amount_usdc));
  const topList = [...top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">Rewards</h1>
        <p className="mt-1 text-sm text-muted-foreground">Trade rewards (referrals and posts) and feed share rewards. Revoking removes the reward from the ledger and from the balance.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[["Referral rewards", usd(sum("referral"))], ["Post rewards", usd(sum("post"))], ["Platform fees on rewarded buys", usd(fees)]].map(([l, v]) => (
          <div key={l} className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="mt-1 text-xl font-bold">{v}</p></div>
        ))}
      </div>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Top earners (last 300 trade rewards)</h2>
        <div className="divide-y divide-border rounded-2xl border border-border bg-card">
          {topList.length === 0 && <p className="p-4 text-sm text-muted-foreground">No rewards yet.</p>}
          {topList.map(([w, a]) => (<div key={w} className="flex justify-between p-3 text-sm"><span className="font-mono text-xs">{short(w)}</span><span className="font-semibold">{usd(a)}</span></div>))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Trade rewards</h2>
        <div className="divide-y divide-border rounded-2xl border border-border bg-card">
          {trades.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nothing yet.</p>}
          {trades.slice(0, 100).map((x) => (
            <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs">
              <div className="min-w-0">
                <p><span className="font-semibold">{x.kind}</span> · {x.chain} · {short(x.beneficiary)} <span className="text-muted-foreground">from {short(x.trader)}</span></p>
                <p className="text-muted-foreground">volume {usd(Number(x.volume_usd))} · fee {usd(Number(x.platform_fee_usd))} · {new Date(x.created_at).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold">{usd(Number(x.amount_usdc))}</span>
                <AdminAction url="/api/admin/rewards" body={{ action: "revoke_trade", id: x.id }} label="Revoke" danger confirm="Revoke this reward?" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Feed share rewards</h2>
        <div className="divide-y divide-border rounded-2xl border border-border bg-card">
          {shares.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nothing yet.</p>}
          {shares.slice(0, 100).map((x) => (
            <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs">
              <div>
                <p><span className="font-semibold">{x.market_kind}</span> · {short(x.sharer)}</p>
                <p className="text-muted-foreground">{new Date(x.created_at).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold">{x.omero > 0 ? `${x.omero} OMERO` : Number(x.amount_clt) > 0 ? `${Number(x.amount_clt)} CLT` : usd(Number(x.amount_usdc))}</span>
                {x.omero === 0 && <AdminAction url="/api/admin/rewards" body={{ action: "revoke_share", id: x.id }} label="Revoke" danger confirm="Revoke this reward?" />}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
