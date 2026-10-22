/**
 * Classement du fil « Pour toi » (simple et léger, calculé à chaque requête sur ~400 posts récents).
 *
 *   note = (réponses×6 + reposts×4 + likes×1 + vues×0,05 + 1) / (heures + 2)^1,5
 *   ×2 si le lecteur suit l'auteur (ou celui qui a republié), ×1,5 pour ses propres posts,
 *   ×1,3 si l'auteur a la puce de vérification (1 000 OMERO et plus).
 *
 * Puis mélange ~60 % comptes suivis / ~40 % autres (3 pour 2), et jamais plus de 2 posts d'affilée du même auteur.
 */

export type RankRow = {
  id: string; author: string; created_at: string;
  like_count: number; reply_count: number; view_count: number; repost_count?: number | null;
  repost_of?: string | null;
};

export type RankCtx = { now: number; viewer: string | null; followed: Set<string>; octo: Map<string, number> };

export const VERIFIED_MIN = 1000;

export function scorePost(r: RankRow, c: RankCtx): number {
  const hours = Math.max(0, (c.now - Date.parse(r.created_at)) / 3_600_000);
  const eng = (r.reply_count || 0) * 6 + (r.repost_count || 0) * 4 + (r.like_count || 0) + (r.view_count || 0) * 0.05 + 1;
  let s = eng / Math.pow(hours + 2, 1.5);
  if (c.followed.has(r.author)) s *= 2;
  if (c.viewer && r.author === c.viewer) s *= 1.5;
  if ((c.octo.get(r.author) ?? 0) >= VERIFIED_MIN) s *= 1.3;
  return s;
}

export function rankFeed<T extends RankRow>(rows: T[], c: RankCtx): T[] {
  // Un repost ne compte que s'il vient d'un compte suivi ; un même post n'apparaît qu'une fois
  const best = new Map<string, { row: T; score: number; mine: boolean }>();
  for (const r of rows) {
    if (r.repost_of && !c.followed.has(r.author)) continue;
    const key = r.repost_of ?? r.id;
    const score = scorePost(r, c);
    const mine = c.followed.has(r.author) || (!!c.viewer && r.author === c.viewer);
    const cur = best.get(key);
    // L'original passe avant un repost à note égale (il porte les vrais compteurs)
    if (!cur || score > cur.score || (score === cur.score && !r.repost_of)) best.set(key, { row: r, score, mine });
  }
  const byScore = (a: { row: T; score: number }, b: { row: T; score: number }) => b.score - a.score || Date.parse(b.row.created_at) - Date.parse(a.row.created_at);
  const all = [...best.values()].sort(byScore);
  const fol = all.filter((x) => x.mine);
  const oth = all.filter((x) => !x.mine);

  // 3 posts de comptes suivis pour 2 autres
  const mixed: T[] = [];
  let i = 0, j = 0, k = 0;
  while (i < fol.length || j < oth.length) {
    const wantFollowed = k % 5 < 3;
    if ((wantFollowed && i < fol.length) || j >= oth.length) mixed.push(fol[i++].row);
    else mixed.push(oth[j++].row);
    k++;
  }

  // Pas plus de 2 posts d'affilée du même auteur (on avance le suivant d'un autre auteur)
  const out: T[] = [];
  const rest = [...mixed];
  while (rest.length) {
    const n = out.length;
    const same = n >= 2 && out[n - 1].author === out[n - 2].author;
    let idx = 0;
    if (same) {
      const f = rest.findIndex((r) => r.author !== out[n - 1].author);
      if (f > 0) idx = f;
    }
    out.push(rest.splice(idx, 1)[0]);
  }
  return out;
}
