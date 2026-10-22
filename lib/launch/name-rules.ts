/** Limites du nom et du ticker d'un token (site, API, agents). */
export const NAME_MAX = 10;
export const TICKER_MAX = 8;

/** null si valide, sinon le message d'erreur (en anglais, traduit à l'affichage). */
export function nameTickerError(name: string, ticker: string): string | null {
  const n = name.trim(), t = ticker.trim();
  if (!n) return "Name is required";
  if (!t) return "Ticker is required";
  if ([...n].length > NAME_MAX) return `Name must be ${NAME_MAX} characters or fewer`;
  if (!/^[A-Za-z0-9]+$/.test(t)) return "Ticker must be letters and digits only";
  if (t.length < 2 || t.length > TICKER_MAX) return `Ticker must be 2 to ${TICKER_MAX} characters`;
  return null;
}
