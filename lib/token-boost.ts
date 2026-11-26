/** Boost de tokens dans « Tokens en tendance » du fil : payé en Omero uniquement, ouvert à tous, sur n'importe quel token du Terminal. */
export const TOKEN_BOOST_COST_OMERO = 100_000;
export const TOKEN_BOOST_HOURS = 24;

const SOLANA_ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_ADDR = /^0x[0-9a-fA-F]{40}$/;

/** Pur : adresse de token valable pour ce réseau (Solana en base58, les autres en 0x). */
export function validTokenAddress(chain: string, mint: string): boolean {
  return chain === "solana" ? SOLANA_ADDR.test(mint) : EVM_ADDR.test(mint);
}

/** Pur : lien à ouvrir pour un token (page OM pour un lancement OM, sinon le Terminal). */
export function tokenHref(t: { chain: string; mint: string; om?: boolean }): string {
  if (t.om) return `/launchpad/${t.mint}`;
  return `/terminal?${t.chain !== "solana" ? `chain=${t.chain}&` : ""}mint=${encodeURIComponent(t.mint)}`;
}

/** Pur : score de tendance (volume 24 h et engagement sur OM : posts, likes, réponses). */
export function trendScore(volume24h: number | null | undefined, engagement: number): number {
  return Math.log10(Math.max(0, volume24h ?? 0) + 1) + 1.5 * Math.log2(engagement + 1);
}
