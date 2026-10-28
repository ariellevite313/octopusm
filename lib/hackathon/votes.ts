/**
 * Calcul des votes d'un wallet pour un projet.
 *  - 1 $ dépensé en achat = 1 vote, à la valeur payée (le prix qui bouge ne change rien).
 *  - Seuls les achats faits pendant la fenêtre du hackathon comptent.
 *  - Une vente retire des tokens du plus ancien lot d'abord (FIFO) : vendre baisse les votes dans la même proportion.
 *  - Un token reçu par transfert n'a pas d'achat dans l'historique : il ne donne aucun vote.
 */
export type Trade = { side: "buy" | "sell"; usd: number; tokenAmount: number; tsMs: number };
export type Window = { startMs: number; endMs: number };

export function computeVotes(trades: Trade[], win: Window): number {
  const sorted = [...trades].filter((t) => t.usd > 0 && t.tokenAmount > 0).sort((a, b) => a.tsMs - b.tsMs);
  type Lot = { tokens: number; cost: number; inWindow: boolean };
  const lots: Lot[] = [];
  for (const t of sorted) {
    if (t.side === "buy") {
      lots.push({ tokens: t.tokenAmount, cost: t.usd, inWindow: t.tsMs >= win.startMs && t.tsMs <= win.endMs });
      continue;
    }
    let toSell = t.tokenAmount;
    while (toSell > 1e-12 && lots.length > 0) {
      const lot = lots[0];
      if (lot.tokens <= toSell + 1e-12) { toSell -= lot.tokens; lots.shift(); }
      else {
        const share = toSell / lot.tokens;
        lot.cost -= lot.cost * share;
        lot.tokens -= toSell;
        toSell = 0;
      }
    }
  }
  const votes = lots.reduce((n, l) => n + (l.inWindow ? l.cost : 0), 0);
  return Math.floor(votes * 100) / 100;
}

/** Plafond par wallet (un groupe de wallets liés compte comme un seul). */
export function capVotes(votes: number, cap: number): number {
  return Math.min(votes, cap);
}
