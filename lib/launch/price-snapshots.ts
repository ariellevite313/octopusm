export type Snapshot = { t: number; p: number };           // t = secondes, p = prix USD
export type Bar = { time: number; open: number; high: number; low: number; close: number };

/** Regroupe des relevés de prix en bougies (open/high/low/close) par tranche de `bucketSec` secondes. */
export function snapshotsToBars(rows: Snapshot[], bucketSec = 300): Bar[] {
  const sorted = rows.filter((r) => r.p > 0 && Number.isFinite(r.p)).sort((a, b) => a.t - b.t);
  const bars: Bar[] = [];
  for (const { t, p } of sorted) {
    const time = Math.floor(t / bucketSec) * bucketSec;
    const last = bars[bars.length - 1];
    if (last && last.time === time) {
      last.high = Math.max(last.high, p);
      last.low = Math.min(last.low, p);
      last.close = p;
    } else {
      // Une bougie s'ouvre au dernier prix connu : pas de trou entre deux bougies
      const open = last ? last.close : p;
      bars.push({ time, open, high: Math.max(open, p), low: Math.min(open, p), close: p });
    }
  }
  return bars;
}

/** Petite série de prix pour la mini-courbe (au plus `max` points, les plus récents). */
export function snapshotsToPoints(rows: Snapshot[], max = 40): number[] {
  return rows.filter((r) => r.p > 0).sort((a, b) => a.t - b.t).slice(-max).map((r) => r.p);
}

/** Garde la dernière valeur connue : une nouvelle valeur vide n'écrase jamais l'ancienne. */
export function keepLastKnown<T extends Record<string, number | null | undefined>>(fresh: T): Partial<{ [K in keyof T]: number }> {
  const out: Partial<{ [K in keyof T]: number }> = {};
  for (const k of Object.keys(fresh) as (keyof T)[]) {
    const v = fresh[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}
