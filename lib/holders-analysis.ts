/** Analyse des holders : concentration, bundle (achats groupés au lancement), disposition en bulles. */

export type HolderLite = { owner: string; pct: number; isProgram: boolean };

/** Concentration hors pool / programme : top 10, plus gros holder. */
export function concentration(rows: HolderLite[]) {
  const real = rows.filter((r) => !r.isProgram).sort((a, b) => b.pct - a.pct);
  const top10 = real.slice(0, 10).reduce((s, r) => s + r.pct, 0);
  const pool = rows.filter((r) => r.isProgram).reduce((s, r) => s + r.pct, 0);
  return { top10, biggest: real[0] ?? null, poolPct: pool, count: real.length };
}

export type EarlyTx = { slot: number; signer: string; ok: boolean };

/**
 * Bundle : portefeuilles qui ont acheté dans les premiers blocs après la création du pool
 * (hors créateur). Part du supply qu'ils détiennent encore.
 */
export function detectBundle(txs: EarlyTx[], creator: string | null, balancesPct: Map<string, number>, windowSlots = 3) {
  const ok = txs.filter((t) => t.ok);
  if (!ok.length) return { wallets: [] as string[], pct: 0 };
  const first = Math.min(...ok.map((t) => t.slot));
  const wallets = [...new Set(ok.filter((t) => t.slot <= first + windowSlots && t.signer !== creator).map((t) => t.signer))];
  const pct = wallets.reduce((s, w) => s + (balancesPct.get(w) ?? 0), 0);
  return { wallets, pct };
}

export type Bubble = { owner: string; pct: number; x: number; y: number; r: number };

/** Dispose des cercles (aire ∝ pourcentage) sans chevauchement, du plus gros au plus petit, en spirale. */
export function packBubbles(items: { owner: string; pct: number }[], size = 100, minR = 1.2, maxR = 22): Bubble[] {
  const sorted = items.filter((i) => i.pct > 0).sort((a, b) => b.pct - a.pct);
  if (!sorted.length) return [];
  const top = sorted[0].pct;
  const placed: Bubble[] = [];
  const c = size / 2;
  for (const it of sorted) {
    const r = Math.max(minR, maxR * Math.sqrt(it.pct / top));
    let pos: { x: number; y: number } | null = null;
    for (let k = 0; k < 4000 && !pos; k++) {
      const a = k * 0.45;
      const d = 0.35 * k * 0.1 + (placed.length ? 0 : 0);
      const x = c + Math.cos(a) * d, y = c + Math.sin(a) * d;
      if (placed.every((p) => Math.hypot(p.x - x, p.y - y) >= p.r + r + 0.4)) pos = { x, y };
    }
    placed.push({ owner: it.owner, pct: it.pct, r, ...(pos ?? { x: c, y: c }) });
  }
  return placed;
}

export type Cluster = { id: number; members: string[]; supply: number };

/** Groupes de portefeuilles reliés entre eux (composantes connexes), avec leur part cumulée du supply. */
export function buildClusters(owners: { owner: string; pct: number }[], links: { a: string; b: string }[]): { clusters: Cluster[]; of: Map<string, number> } {
  const pct = new Map(owners.map((o) => [o.owner, o.pct]));
  const parent = new Map<string, string>();
  const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(x, r); return r; };
  for (const l of links) {
    if (!pct.has(l.a) || !pct.has(l.b)) continue;
    for (const id of [l.a, l.b]) if (!parent.has(id)) parent.set(id, id);
    parent.set(find(l.a), find(l.b));
  }
  const groups = new Map<string, string[]>();
  for (const id of parent.keys()) { const r = find(id); groups.set(r, [...(groups.get(r) ?? []), id]); }
  const clusters = [...groups.values()]
    .map((members) => ({ members, supply: members.reduce((s, m) => s + (pct.get(m) ?? 0), 0) }))
    .sort((a, b) => b.supply - a.supply)
    .map((c, id) => ({ id, ...c }));
  const of = new Map<string, number>();
  for (const c of clusters) for (const m of c.members) of.set(m, c.id);
  return { clusters, of };
}
