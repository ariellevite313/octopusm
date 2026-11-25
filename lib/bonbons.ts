/** Les tips se donnent en bonbons Omero : un bonbon blanc vaut 10 OMERO, un bonbon orange vaut 100 OMERO. */
export const BONBON_WHITE = 10;
export const BONBON_ORANGE = 100;

/** Découpe un montant d'OMERO en bonbons (orange d'abord). Le reste, inférieur à 10, n'a pas de bonbon. */
export function splitBonbons(amount: number): { orange: number; white: number } {
  const a = Math.max(0, Math.floor(Number(amount) || 0));
  const orange = Math.floor(a / BONBON_ORANGE);
  const white = Math.floor((a % BONBON_ORANGE) / BONBON_WHITE);
  return { orange, white };
}

export const bonbonsValue = (orange: number, white: number) => orange * BONBON_ORANGE + white * BONBON_WHITE;
