/** Calculs du tableau de bord parrain (purs, testés) : gains par période, estimation des 30 prochains jours. */
export type Gain = { at: number; usd: number };

const DAY = 86_400_000;

export function gainsByPeriod(gains: Gain[], now = Date.now()) {
  const sum = (ms: number) => gains.reduce((s, g) => (now - g.at <= ms ? s + g.usd : s), 0);
  const startOfDay = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  return {
    today: gains.reduce((s, g) => (g.at >= startOfDay ? s + g.usd : s), 0),
    week: sum(7 * DAY),
    month: sum(30 * DAY),
    all: gains.reduce((s, g) => s + g.usd, 0),
  };
}

/**
 * Estimation des 30 prochains jours au rythme récent : moyenne journalière des 7 derniers jours
 * pondérée avec celle des 30 derniers (le récent compte double). Ce n'est pas une promesse.
 */
export function estimateNext30(gains: Gain[], now = Date.now()) {
  const p = gainsByPeriod(gains, now);
  const daily = (2 * (p.week / 7) + p.month / 30) / 3;
  return Math.round(daily * 30 * 100) / 100;
}
