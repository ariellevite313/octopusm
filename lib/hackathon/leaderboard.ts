/** Classement du hackathon : lit les chiffres mis à jour par le cron et applique le score et la cagnotte. */
import { HACKATHON } from "./config";
import { evaluateHealth, nextTier, prizePool, rankProjects, assignPrizes, tierReached, type ProjectMetrics } from "./scoring";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type BoardRow = {
  rank: number; projectId: string; tokenId: string; name: string; ticker: string | null; logoUrl: string | null; category: string;
  score: number; holders: number; volumeUsd: number; votes: number;
  graduated: boolean; eligible: boolean; reasons: string[]; prizeUsd: number | null; mint: string | null;
  /** Ce qu'il faut pour ouvrir la fenêtre d'achat du token. */
  trade: TradeToken;
};
export type TradeToken = { id: string; name: string; ticker: string; logo_url: string | null; chain: "solana" | "arc"; market_cap_usd: number | null; mint_address: string | null; pool_address: string | null; arc_launch_id: string | null; stock_symbol: string | null; status: string };
export type Board = {
  poolUsd: number; tier: number; nextTier: number | null; totalVolumeUsd: number;
  startsAt: string; endsAt: string; rows: BoardRow[];
};

export async function loadBoard(db: Db): Promise<Board> {
  const { data: projects } = await db.from("hackathon_projects")
    .select("id, token_id, name, category, status, hackathon_stats(*)").eq("status", "approved");
  type P = { id: string; token_id: string; name: string; category: string; hackathon_stats: Stat | Stat[] | null };
  type Stat = { holders: number; top10_pct: number; biggest_pct: number; bundle_pct: number; volume_usd: number; votes: number; platform_rate: number; had_volume_7d: boolean; price_ratio: number | null; frozen_intact: boolean };
  const list = (projects ?? []) as P[];
  const ids = list.map((p) => p.token_id);
  type Tk = { id: string; name: string; ticker: string; logo_url: string | null; status: string; mint_address: string | null; chain: "solana" | "arc"; pool_address: string | null; arc_launch_id: string | null; stock_symbol: string | null };
  const toks = new Map<string, Tk>();
  if (ids.length > 0) {
    const { data } = await db.from("launchpad_tokens").select("id, name, ticker, logo_url, status, mint_address, chain, pool_address, arc_launch_id, stock_symbol").in("id", ids);
    for (const t of (data ?? []) as Tk[]) toks.set(t.id, t);
  }

  const stat = (p: P): Stat => (Array.isArray(p.hackathon_stats) ? p.hackathon_stats[0] : p.hackathon_stats) ??
    { holders: 0, top10_pct: 0, biggest_pct: 0, bundle_pct: 0, volume_usd: 0, votes: 0, platform_rate: 0.0068, had_volume_7d: false, price_ratio: null, frozen_intact: true };

  const metrics: (ProjectMetrics & { reasons: string[] })[] = list.map((p) => {
    const s = stat(p);
    const tok = toks.get(p.token_id);
    const h = evaluateHealth({
      holders: Number(s.holders), top10Pct: Number(s.top10_pct), biggestPct: Number(s.biggest_pct), bundlePct: Number(s.bundle_pct),
      priceRatio: s.price_ratio === null ? null : Number(s.price_ratio), hadVolume7d: s.had_volume_7d, frozenIntact: s.frozen_intact,
    });
    return {
      id: p.id, holders: Number(s.holders), volumeUsd: Number(s.volume_usd), votes: Number(s.votes),
      graduated: tok?.status === "graduated", healthy: h.healthy, excluded: false, reasons: h.reasons,
    };
  });

  const pool = prizePool(list.map((p) => ({ volumeUsd: Number(stat(p).volume_usd), platformRate: Number(stat(p).platform_rate) })));
  const ranked = rankProjects(metrics);
  const prizes = assignPrizes(ranked, pool);
  const byId = new Map(list.map((p) => [p.id, p]));
  const reasons = new Map(metrics.map((m) => [m.id, m.reasons]));

  return {
    poolUsd: pool, tier: tierReached(pool), nextTier: nextTier(pool),
    totalVolumeUsd: list.reduce((n, p) => n + Number(stat(p).volume_usd), 0),
    startsAt: HACKATHON.startsAt, endsAt: HACKATHON.endsAt,
    rows: ranked.map((r) => {
      const p = byId.get(r.id)!;
      const tok = toks.get(p.token_id);
      return {
        rank: r.rank, projectId: r.id, tokenId: p.token_id, name: p.name, ticker: tok?.ticker ?? null, logoUrl: tok?.logo_url ?? null,
        category: p.category, score: r.score, holders: r.holders, volumeUsd: r.volumeUsd, votes: r.votes,
        graduated: r.graduated, eligible: r.eligible, reasons: reasons.get(r.id) ?? [], prizeUsd: prizes.get(r.id) ?? null, mint: tok?.mint_address ?? null,
        trade: { id: p.token_id, name: tok?.name ?? p.name, ticker: tok?.ticker ?? "", logo_url: tok?.logo_url ?? null, chain: tok?.chain ?? "solana", market_cap_usd: null, mint_address: tok?.mint_address ?? null, pool_address: tok?.pool_address ?? null, arc_launch_id: tok?.arc_launch_id ?? null, stock_symbol: tok?.stock_symbol ?? null, status: tok?.status ?? "active" },
      };
    }),
  };
}
