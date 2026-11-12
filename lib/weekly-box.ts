/**
 * Box de la semaine.
 * Chaque activité sur OM rapporte des points (avec un plafond par jour pour éviter le spam).
 * Semaine = lundi 00:00 UTC → lundi suivant. À la fin : le top 10 reçoit ses points en OMERO (1 point = 1 OMERO),
 * et le premier éligible (au moins un trade ou pari ET au moins un post) gagne une box de 0,05 SOL à réclamer.
 */
export type Activity = "trade" | "bet" | "post" | "article" | "bag" | "reply" | "tip" | "launch";

export const POINTS: Record<Activity, number> = {
  trade: 40, bet: 30, post: 25, article: 40, bag: 30, reply: 5, tip: 15, launch: 50,
};
/** Nombre maximum d'activités qui comptent par jour (UTC), par type. */
export const DAILY_CAP: Record<Activity, number> = {
  trade: 10, bet: 10, post: 5, article: 2, bag: 3, reply: 10, tip: 10, launch: 2,
};
export const TOP_N = 10;
export const PRIZE_SOL = 0.05;
/** Montant minimum (en $) pour qu'un trade compte. */
export const MIN_TRADE_USD = 1;

const DAY = 86_400_000;
const WEEK = 7 * DAY;

/** Lundi 00:00 UTC de la semaine qui contient `d`. */
export function weekStart(d: Date): Date {
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = (new Date(t).getUTCDay() + 6) % 7; // lundi = 0
  return new Date(t - dow * DAY);
}
export const weekEnd = (start: Date) => new Date(start.getTime() + WEEK);
export const previousWeek = (start: Date) => new Date(start.getTime() - WEEK);
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export type Event = { wallet: string; kind: Activity; at: string | number };
export type Score = { wallet: string; points: number; counts: Partial<Record<Activity, number>>; eligible: boolean };

const norm = (w: string) => (/^0x[0-9a-fA-F]{40}$/.test(w) ? w.toLowerCase() : w);

/** Additionne les points avec le plafond journalier par type d'activité. */
export function scoreEvents(events: Event[]): Map<string, Score> {
  const used = new Map<string, number>(); // wallet|kind|jour → nombre déjà compté
  const out = new Map<string, Score>();
  for (const e of events) {
    if (!e.wallet || !(e.kind in POINTS)) continue;
    const w = norm(e.wallet);
    const ms = typeof e.at === "number" ? e.at : Date.parse(e.at);
    if (!Number.isFinite(ms)) continue;
    const key = `${w}|${e.kind}|${Math.floor(ms / DAY)}`;
    const n = used.get(key) ?? 0;
    if (n >= DAILY_CAP[e.kind]) continue;
    used.set(key, n + 1);
    const s = out.get(w) ?? { wallet: w, points: 0, counts: {}, eligible: false };
    s.points += POINTS[e.kind];
    s.counts[e.kind] = (s.counts[e.kind] ?? 0) + 1;
    out.set(w, s);
  }
  for (const s of out.values()) {
    const traded = (s.counts.trade ?? 0) + (s.counts.bet ?? 0) > 0;
    const posted = (s.counts.post ?? 0) + (s.counts.article ?? 0) + (s.counts.bag ?? 0) > 0;
    s.eligible = traded && posted;
  }
  return out;
}

/**
 * Classement : uniquement les comptes éligibles et non bannis, points décroissants.
 * À égalité, le plus d'activités différentes passe devant, puis l'adresse (ordre stable).
 */
export function rankScores(scores: Iterable<Score>, banned: (w: string) => boolean = () => false): Score[] {
  const variety = (s: Score) => Object.values(s.counts).filter((n) => (n ?? 0) > 0).length;
  return [...scores]
    .filter((s) => s.eligible && s.points > 0 && !banned(s.wallet))
    .sort((a, b) => b.points - a.points || variety(b) - variety(a) || (a.wallet < b.wallet ? -1 : a.wallet > b.wallet ? 1 : 0));
}
