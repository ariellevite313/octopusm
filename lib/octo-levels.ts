/** Seuils des niveaux Omero (mêmes que OCTO_TIERS), sans JSX : utilisables côté serveur et dans les tests. */
export const LEVEL_MINS = [1_000, 5_001, 10_001, 20_001, 50_001] as const;

/** Index du niveau atteint : -1 = aucun, 0 = Bleu … 4 = Rouge */
export function levelOfTotal(total: number): number {
  let idx = -1;
  LEVEL_MINS.forEach((m, i) => { if (total >= m) idx = i; });
  return idx;
}
