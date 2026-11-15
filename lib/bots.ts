/**
 * Détection de robots parmi les holders d'un token (estimation, pas une certitude).
 *  - sniper : premier achat dans les secondes qui suivent l'ouverture du marché
 *  - bot    : rythme de machine (beaucoup de transactions à intervalles très réguliers, ou en rafale)
 * Les wallets d'IA d'OM (connexions MCP) ne sont jamais comptés comme robots.
 */
export type BotKind = "sniper" | "bot";
export type BotHit = { owner: string; kind: BotKind; pct: number };

/** Secondes après l'ouverture du marché pendant lesquelles un premier achat compte comme sniper. */
export const SNIPE_WINDOW_S = 12;

/** times : horodatages (secondes) des transactions du compte de token du holder, dans n'importe quel ordre. */
export function classify(times: number[], openedAt: number | null): BotKind | null {
  const t = [...times].filter((x) => x > 0).sort((a, b) => a - b);
  if (!t.length) return null;
  if (openedAt && t[0] >= openedAt - 5 && t[0] <= openedAt + SNIPE_WINDOW_S) return "sniper";
  if (t.length < 12) return null;
  const gaps = t.slice(1).map((x, i) => x - t[i]).filter((g) => g >= 0);
  // Rafale : 30 transactions ou plus en moins d'une heure
  for (let i = 0; i + 29 < t.length; i++) if (t[i + 29] - t[i] <= 3600) return "bot";
  // Intervalles quasi constants (coefficient de variation faible) sur au moins 12 transactions
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  if (mean > 0 && mean < 6 * 3600) {
    const sd = Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length);
    if (sd / mean < 0.2) return "bot";
  }
  return null;
}

/** Résultat final : robots hors wallets exclus (IA d'OM, créateur), avec leur part du supply. */
export function summarizeBots(hits: BotHit[], exclude: Set<string>) {
  const wallets = hits.filter((h) => !exclude.has(h.owner) && !exclude.has(h.owner.toLowerCase()));
  return { wallets, pct: wallets.reduce((s, h) => s + h.pct, 0) };
}
