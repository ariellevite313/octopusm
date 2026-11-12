/**
 * Côté serveur de la box de la semaine : lecture des activités, classement, règlement de la semaine écoulée.
 * Le règlement est atomique et ne peut avoir lieu qu'une fois par semaine (fonction SQL settle_weekly_box).
 */
import { createAdminClient } from "@/lib/supabase/server";
import { type Activity, type Event, type Score, MIN_TRADE_USD, PRIZE_SOL, TOP_N, isoDay, previousWeek, rankScores, scoreEvents, weekEnd, weekStart } from "@/lib/weekly-box";

 
type Db = any;
const PAGE = 1000;
const MAX_ROWS = 50_000;

/** Lit toutes les lignes d'une requête, page par page (PostgREST renvoie 1000 lignes maximum par appel). */
async function all<T>(build: () => Db): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Une source qui échoue (table absente, colonne renommée) ne bloque pas les autres. */
async function safe(label: string, f: () => Promise<Event[]>): Promise<Event[]> {
  try { return await f(); } catch (e) { console.error(`[weekly-box] ${label}:`, (e as Error).message); return []; }
}

export async function loadEvents(db: Db, from: Date, to: Date): Promise<Event[]> {
  const a = from.toISOString(), b = to.toISOString();
  const ev = (kind: Activity) => (wallet: string, at: string | number): Event => ({ wallet, kind, at });
  const parts = await Promise.all([
    safe("swaps", async () => (await all<{ wallet: string; created_at: string }>(() =>
      db.from("swaps").select("wallet, created_at").gte("created_at", a).lt("created_at", b).gte("volume_usd", MIN_TRADE_USD).order("created_at")))
      .map((r) => ev("trade")(r.wallet, r.created_at))),
    safe("token_trades", async () => (await all<{ wallet: string; ts: string }>(() =>
      db.from("token_trades").select("wallet, ts").gte("ts", a).lt("ts", b).gte("usd", MIN_TRADE_USD).order("ts")))
      .map((r) => ev("trade")(r.wallet, r.ts))),
    safe("arc_trades", async () => (await all<{ trader: string; ts: number }>(() =>
      db.from("arc_trades").select("trader, ts").gte("ts", Math.floor(from.getTime() / 1000)).lt("ts", Math.floor(to.getTime() / 1000)).gte("usdc_amt", MIN_TRADE_USD).order("ts")))
      .map((r) => ev("trade")(r.trader, Number(r.ts) * 1000))),
    ...(["mutuel_bets", "updown_bets", "prediction_history"] as const).map((t) => safe(t, async () => (await all<{ wallet_address: string; created_at: string }>(() =>
      db.from(t).select("wallet_address, created_at").gte("created_at", a).lt("created_at", b).order("created_at")))
      .map((r) => ev("bet")(r.wallet_address, r.created_at)))),
    safe("posts", async () => (await all<{ author: string; kind: string | null; created_at: string }>(() =>
      db.from("posts").select("author, kind, created_at").eq("hidden", false).gte("created_at", a).lt("created_at", b).order("created_at")))
      .map((r) => ev(r.kind === "article" ? "article" : r.kind === "bag" ? "bag" : "post")(r.author, r.created_at))),
    safe("post_replies", async () => (await all<{ author: string; created_at: string }>(() =>
      db.from("post_replies").select("author, created_at").gte("created_at", a).lt("created_at", b).order("created_at")))
      .map((r) => ev("reply")(r.author, r.created_at))),
    safe("post_tips", async () => (await all<{ sender: string; created_at: string }>(() =>
      db.from("post_tips").select("sender, created_at").gte("created_at", a).lt("created_at", b).order("created_at")))
      .map((r) => ev("tip")(r.sender, r.created_at))),
    safe("launchpad_tokens", async () => (await all<{ creator_wallet: string; created_at: string }>(() =>
      db.from("launchpad_tokens").select("creator_wallet, created_at").in("status", ["active", "graduating", "graduated"]).gte("created_at", a).lt("created_at", b).order("created_at")))
      .map((r) => ev("launch")(r.creator_wallet, r.created_at))),
  ]);
  return parts.flat();
}

async function bannedSet(db: Db): Promise<Set<string>> {
  try {
    const rows = await all<{ wallet: string }>(() => db.from("banned_wallets").select("wallet").order("wallet"));
    return new Set(rows.map((r) => (/^0x[0-9a-fA-F]{40}$/.test(r.wallet) ? r.wallet.toLowerCase() : r.wallet)));
  } catch { return new Set(); }
}

export type Standings = { start: Date; end: Date; scores: Map<string, Score>; ranked: Score[] };

export async function standings(db: Db, start: Date): Promise<Standings> {
  const end = weekEnd(start);
  const [events, banned] = await Promise.all([loadEvents(db, start, end), bannedSet(db)]);
  const scores = scoreEvents(events);
  return { start, end, scores, ranked: rankScores(scores.values(), (w) => banned.has(w)) };
}

// Classement de la semaine en cours : recalculé au plus une fois par minute
let cache: { key: string; at: number; p: Promise<Standings> } | null = null;
export function currentStandings(now = new Date()): Promise<Standings> {
  const start = weekStart(now);
  const key = isoDay(start);
  if (cache && cache.key === key && Date.now() - cache.at < 60_000) return cache.p;
  const p = standings(createAdminClient(), start);
  cache = { key, at: Date.now(), p };
  p.catch(() => { if (cache?.p === p) cache = null; });
  return p;
}

/** Règle la semaine écoulée si ce n'est pas déjà fait. Sans risque si plusieurs requêtes arrivent en même temps. */
export async function settlePreviousWeek(now = new Date()): Promise<{ week: string; settled: boolean }> {
  const db = createAdminClient() as Db;
  const prev = previousWeek(weekStart(now));
  const week = isoDay(prev);
  const { data: done } = await db.from("weekly_box_weeks").select("week_start").eq("week_start", week).maybeSingle();
  if (done) return { week, settled: false };
  const { ranked } = await standings(db, prev);
  const rows = ranked.slice(0, TOP_N).map((s) => ({ wallet: s.wallet, points: s.points }));
  const { data, error } = await db.rpc("settle_weekly_box", { p_week: week, p_rows: rows, p_prize: PRIZE_SOL });
  if (error) throw new Error(error.message);
  return { week, settled: !!data };
}
