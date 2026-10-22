/** Tri et regroupement des réponses sous un post. */

/** « Les plus pertinentes » : comptes vérifiés (1 000 OMERO et plus) d'abord, puis dans l'ordre. */
export function sortReplies<T extends { author_octo?: number; created_at: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => Number((b.author_octo ?? 0) >= 1000) - Number((a.author_octo ?? 0) >= 1000) || a.created_at.localeCompare(b.created_at));
}


/** Fils de discussion : chaque réponse de premier niveau suivie de ses réponses (toutes profondeurs), dans l'ordre. */
export function buildThreads<T extends { id: string; parent_id?: string | null; author_octo?: number; created_at: string }>(list: T[]): { root: T; children: T[] }[] {
  const byId = new Map(list.map((r) => [r.id, r]));
  const rootOf = (r: T): string => {
    let cur = r, guard = 0;
    while (cur.parent_id && byId.has(cur.parent_id) && guard++ < 50) cur = byId.get(cur.parent_id)!;
    return cur.id;
  };
  const kids = new Map<string, T[]>();
  const roots: T[] = [];
  for (const r of list) {
    if (!r.parent_id || !byId.has(r.parent_id)) { roots.push(r); continue; }
    const k = rootOf(r);
    kids.set(k, [...(kids.get(k) ?? []), r]);
  }
  return sortReplies(roots).map((root) => ({ root, children: (kids.get(root.id) ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at)) }));
}
