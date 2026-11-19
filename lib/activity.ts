/**
 * Activité d'un compte : ses propres actions (ordres limités, swaps passés par OM) et celles de son Janus
 * (actions du wallet IA, sorties automatiques). Filtrable par token, par date et par auteur.
 * On n'affiche que les 90 dernières entrées (après filtres) : la base n'est pas vidée.
 */
const SOL_MINT_ID = "So11111111111111111111111111111111111111112";
export const ACTIVITY_MAX = 90;
export type ActivityItem = {
  at: string; who: "you" | "janus"; kind: string; label: string; mint: string | null;
  side: "buy" | "sell" | null; usd: number | null; status: string; tx: string | null; error: string | null;
};
export type ActivityQuery = { mint?: string | null; from?: string | null; to?: string | null; who?: "all" | "you" | "janus"; limit?: number };

const fmt = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(2)}`);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getActivity(db: any, owner: string, q: ActivityQuery): Promise<ActivityItem[]> {
  const limit = Math.min(ACTIVITY_MAX, Math.max(1, q.limit ?? ACTIVITY_MAX));
  const who = q.who ?? "all";
  const from = q.from ? new Date(q.from).toISOString() : null;
  // « au » inclut toute la journée
  const to = q.to ? new Date(new Date(q.to).getTime() + 86_400_000).toISOString() : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const range = (x: any, col = "created_at") => { let y = x; if (from) y = y.gte(col, from); if (to) y = y.lt(col, to); return y.order(col, { ascending: false }).limit(limit); };
  const out: ActivityItem[] = [];
  const jobs: Promise<void>[] = [];

  if (who !== "janus") {
    jobs.push((async () => {
      let x = db.from("om_limit_orders").select("order_key, mint, side, amount_sol, target_mcap, status, created_at").eq("maker", owner);
      if (q.mint) x = x.eq("mint", q.mint);
      const { data } = await range(x);
      for (const r of data ?? []) out.push({
        at: r.created_at, who: "you", kind: "limit", mint: r.mint, side: r.side, usd: null,
        // SOL contre USDC : la cible est un prix ; sinon une capitalisation
        label: r.mint === SOL_MINT_ID ? `Limit ${r.side} SOL at $${Number(r.target_mcap)} · ${+Number(r.amount_sol).toFixed(4)} SOL`
          : `Limit ${r.side} at ${fmt(Number(r.target_mcap))} cap · ${Number(r.amount_sol)} ${r.side === "buy" ? "SOL" : "tokens"}`,
        status: r.status === "closed" ? "closed" : "open", tx: null, error: null,
      });
    })());
    jobs.push((async () => {
      let x = db.from("swaps").select("signature, traded_mint, side, volume_usd, created_at").eq("wallet", owner);
      if (q.mint) x = x.eq("traded_mint", q.mint);
      const { data } = await range(x);
      for (const r of data ?? []) out.push({
        at: r.created_at, who: "you", kind: "swap", mint: r.traded_mint, side: r.side, usd: r.volume_usd != null ? Number(r.volume_usd) : null,
        label: r.side === "buy" ? "Bought" : "Sold", status: "done", tx: r.signature, error: null,
      });
    })());
  }

  if (who !== "you") {
    jobs.push((async () => {
      const { data: ws } = await db.from("agent_wallets").select("id").eq("owner", owner);
      const ids = (ws ?? []).map((w: { id: string }) => w.id);
      if (!ids.length) return;
      let x = db.from("agent_wallet_actions").select("kind, amount_usd, status, summary, tx, error, created_at").in("wallet_id", ids);
      if (q.mint) x = x.ilike("summary", `%${q.mint.replace(/[%_\\]/g, "")}%`);
      let e = db.from("agent_exit_rules").select("mint, symbol, sl_pct, tp_x, trail_pct, status, close_reason, last_error, created_at, closed_at").in("wallet_id", ids);
      if (q.mint) e = e.eq("mint", q.mint);
      const [{ data: acts }, { data: exits }] = await Promise.all([range(x), range(e)]);
      for (const r of acts ?? []) {
        const s = String(r.summary ?? "");
        out.push({
          at: r.created_at, who: "janus", kind: r.kind, mint: (s.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/) ?? [null])[0],
          side: /\bsell\b/.test(s) ? "sell" : /\bbuy\b/.test(s) ? "buy" : null, usd: Number(r.amount_usd) || null,
          label: s.replace(/[1-9A-HJ-NP-Za-km-z]{32,44}/g, (m) => `${m.slice(0, 4)}…${m.slice(-4)}`) || r.kind,
          status: r.status, tx: r.tx ?? null, error: r.error ?? null,
        });
      }
      for (const r of exits ?? []) {
        const rule = [r.sl_pct != null && `SL -${r.sl_pct}%`, r.tp_x != null && `TP x${r.tp_x}`, r.trail_pct != null && `trailing -${r.trail_pct}%`].filter(Boolean).join(", ");
        out.push({
          at: r.closed_at ?? r.created_at, who: "janus", kind: "exit", mint: r.mint, side: "sell", usd: null,
          label: r.status === "active" ? `Watching exits (${rule})` : `Exit ${r.close_reason ?? r.status} (${rule})`,
          status: r.status === "active" ? "open" : r.status === "failed" ? "failed" : "done", tx: null, error: r.last_error ?? null,
        });
      }
    })());
  }

  await Promise.all(jobs.map((j) => j.catch(() => {})));
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
