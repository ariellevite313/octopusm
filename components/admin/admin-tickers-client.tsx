"use client";
/** Admin : demandes des équipes DRC-20 pour lancer leur ticker réservé. Vérifier le compte X avant de valider. */
import { useCallback, useEffect, useState } from "react";

type Req = { id: string; ticker: string; wallet: string; x_handle: string; contact: string | null; message: string | null; status: string; created_at: string };
type Res = { ticker: string; original: string; rank: number | null; x_handle: string | null; allowed_wallets: string[] };

export function AdminTickersClient() {
  const [data, setData] = useState<{ requests: Req[]; reserved: Res[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => { fetch("/api/admin/tickers").then((r) => r.json()).then(setData).catch(() => setData({ requests: [], reserved: [] })); }, []);
  useEffect(load, [load]);
  const act = async (id: string, action: "approve" | "reject") => {
    setBusy(id);
    await fetch("/api/admin/tickers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) }).catch(() => {});
    setBusy(null); load();
  };
  const known = new Map((data?.reserved ?? []).map((r) => [r.ticker, r]));
  const pending = (data?.requests ?? []).filter((r) => r.status === "pending");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reserved tickers</h1>
        <p className="text-sm text-muted-foreground">Top 100 native DRC-20 tickers. Only wallets you approve can launch them. Check the project&apos;s X account before approving.</p>
      </div>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pending requests ({pending.length})</h2>
        {!data ? <p className="text-sm text-muted-foreground">Loading…</p> : pending.length === 0 ? <p className="text-sm text-muted-foreground">No request.</p> : pending.map((r) => {
          const k = known.get(r.ticker);
          const match = k?.x_handle ? k.x_handle.toLowerCase() === r.x_handle.toLowerCase() : null;
          return (
            <div key={r.id} className="space-y-2 rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-bold">${r.ticker}</span>
                <a href={`https://x.com/${r.x_handle}`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold underline">@{r.x_handle}</a>
                {match === true && <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-bold">Matches known X</span>}
                {match === false && <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-bold">Known X: @{k?.x_handle}</span>}
              </div>
              <p className="break-all font-mono text-xs text-muted-foreground">{r.wallet}</p>
              {r.contact && <p className="text-sm">Contact: {r.contact}</p>}
              {r.message && <p className="text-sm text-muted-foreground">{r.message}</p>}
              <div className="flex gap-2">
                <button disabled={busy === r.id} onClick={() => act(r.id, "approve")} className="rounded-xl bg-foreground px-4 py-2 text-sm font-bold text-background disabled:opacity-50">Approve</button>
                <button disabled={busy === r.id} onClick={() => act(r.id, "reject")} className="rounded-xl border border-border px-4 py-2 text-sm font-bold disabled:opacity-50">Reject</button>
              </div>
            </div>
          );
        })}
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">List ({data?.reserved.length ?? 0})</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(data?.reserved ?? []).map((r) => (
            <div key={r.ticker} className="rounded-xl border border-border px-3 py-2 text-sm">
              <span className="font-bold">{r.original}</span>
              {r.x_handle && <span className="ml-1 text-xs text-muted-foreground">@{r.x_handle}</span>}
              {r.allowed_wallets.length > 0 && <span className="ml-1 text-xs font-semibold">· {r.allowed_wallets.length} team</span>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
