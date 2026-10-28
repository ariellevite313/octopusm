/** Les votes d'un wallet : par projet, ce qu'il a investi, son rang et son gain estimé. */
import { HACKATHON } from "./config";
import { RULES } from "./rules";
import { computeVotes } from "./votes";
import { loadTrades } from "./ledger";
import { loadBoard } from "./leaderboard";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
const norm = (w: string) => (/^0x[0-9a-fA-F]{40}$/.test(w) ? w.toLowerCase() : w);

export type MyVote = {
  projectId: string; tokenId: string; name: string; ticker: string | null; logoUrl: string | null; mint: string | null;
  votes: number; investedUsd: number; rank: number; inPrizeRange: boolean; estimatedGainUsd: number;
};
export type MyVotes = { totalVotes: number; totalInvestedUsd: number; estimatedGainUsd: number; items: MyVote[] };

export async function loadMyVotes(db: Db, wallet: string): Promise<MyVotes> {
  const w = norm(wallet);
  const board = await loadBoard(db);
  const { data: projects } = await db.from("hackathon_projects").select("id, token_id, team_wallets, applicant").eq("status", "approved");
  const meta = new Map<string, { team: string[]; applicant: string }>(
    ((projects ?? []) as { id: string; token_id: string; team_wallets: string[]; applicant: string }[]).map((p) => [p.id, { team: p.team_wallets ?? [], applicant: p.applicant }]));
  const ids = board.rows.map((r) => r.tokenId);
  const toks = new Map<string, { id: string; chain: string | null; arc_launch_id: string | null }>();
  if (ids.length) {
    const { data } = await db.from("launchpad_tokens").select("id, chain, arc_launch_id").in("id", ids);
    for (const t of (data ?? []) as { id: string; chain: string | null; arc_launch_id: string | null }[]) toks.set(t.id, t);
  }
  const win = { startMs: Date.parse(HACKATHON.startsAt), endMs: Date.parse(HACKATHON.endsAt) };

  const items: MyVote[] = [];
  for (const r of board.rows) {
    const t = toks.get(r.tokenId);
    const m = meta.get(r.projectId);
    if (!t || !m) continue;
    if ([...m.team, m.applicant].map(norm).includes(w)) continue; // l'équipe ne vote pas pour son propre token
    const trades = await loadTrades(db, t, w);
    const votes = Math.min(computeVotes(trades, win), RULES.voteCapPerWallet);
    if (votes < RULES.minVoteUsd) continue;
    const prize = r.prizeUsd ?? 0;
    const gain = r.votes > 0 ? Math.floor((prize * RULES.voterShare * votes / r.votes) * 100) / 100 : 0;
    items.push({
      projectId: r.projectId, tokenId: r.tokenId, name: r.name, ticker: r.ticker, logoUrl: r.logoUrl, mint: r.mint,
      votes, investedUsd: votes, rank: r.rank, inPrizeRange: r.prizeUsd !== null, estimatedGainUsd: gain,
    });
  }
  items.sort((a, b) => b.votes - a.votes);
  return {
    totalVotes: items.reduce((n, i) => n + i.votes, 0), totalInvestedUsd: items.reduce((n, i) => n + i.investedUsd, 0),
    estimatedGainUsd: items.reduce((n, i) => n + i.estimatedGainUsd, 0), items,
  };
}
