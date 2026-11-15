/**
 * Monnaies de paire spéciales pour les lancements sur Solana (en plus de SOL et des xStocks) :
 * DOGE (DSOL-20), PEPE et ClawdTrust (CLT). Les adresses des tokens lancés commencent par leur préfixe
 * (clés générées à l'avance, voir scripts/import-vanity-keys.mjs). Les frais du pool sont pris dans cette monnaie.
 */
export type PairQuote = "doge" | "pepe" | "clt";

export type PairQuoteInfo = {
  key: PairQuote;
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  /** Texte des adresses des tokens lancés avec cette paire (au début, ou à la fin si atEnd) */
  prefix: string;
  atEnd?: boolean;
  /** Nom de la famille de tokens (Terminal) : DSOL-20, PSOL-20, CLT-20 */
  label: string;
  logo: string;
  /** Variable d'environnement de la config Meteora (+ "_LOW" pour les frais réduits) */
  configEnv: string;
  /** Achat / vente en SOL possible (conversion SOL <-> monnaie via Jupiter) */
  solRoute: boolean;
  /** Premier achat : minimum et maximum, dans cette monnaie */
  firstBuy: [number, number];
};

export const PAIR_QUOTES: Record<PairQuote, PairQuoteInfo> = {
  doge: { key: "doge", symbol: "DOGE", name: "Dogecoin", mint: "DoGEV7LASBkQbibMc5k5vKnTZoMg423GpJ5QtJEGfm7R", decimals: 8, prefix: "DoGE", label: "DSOL-20", logo: "/chains/dogecoin.png", configEnv: "DBC_CONFIG_KEY_DOGE", solRoute: true, firstBuy: [1, 1_000_000] },
  pepe: { key: "pepe", symbol: "PEPE", name: "Pepe", mint: "PEPEqnuuCDbBC89p1u9vpnP1KQ2oj1xTcQBsjt9X55m", decimals: 4, prefix: "PEPE", atEnd: true, label: "PSOL-20", logo: "/pepe.png", configEnv: "DBC_CONFIG_KEY_PEPE", solRoute: true, firstBuy: [10_000, 10_000_000_000] },
  clt: { key: "clt", symbol: "CLT", name: "ClawdTrust", mint: "DjdyfQGdtiejPhaSgraS1qaiWVhgrEFTSnd9bVnYBAGS", decimals: 9, prefix: "CLT", label: "CLT-20", logo: "/clawdtrust-coin.png", configEnv: "DBC_CONFIG_KEY_CLT", solRoute: false, firstBuy: [1_000, 500_000_000] },
};

/** Paires proposées dans le formulaire (activées côté site ; le serveur vérifie aussi que la config existe). */
export const PAIR_LAUNCH_ON: Record<PairQuote, boolean> = {
  doge: process.env.NEXT_PUBLIC_DOGE_LAUNCH === "1",
  pepe: process.env.NEXT_PUBLIC_PEPE_LAUNCH === "1",
  clt: process.env.NEXT_PUBLIC_CLT_LAUNCH === "1",
};

export const isPairQuote = (q: unknown): q is PairQuote => q === "doge" || q === "pepe" || q === "clt";

/** L'adresse porte bien le texte de la paire (début ou fin). */
export const hasPairMark = (q: PairQuoteInfo, address: string) => (q.atEnd ? address.endsWith(q.prefix) : address.startsWith(q.prefix));

export function pairQuoteByMint(mint: string | null | undefined): PairQuoteInfo | null {
  if (!mint) return null;
  return Object.values(PAIR_QUOTES).find((q) => q.mint === mint) ?? null;
}
