/**
 * Lit, dans une transaction Solana, ce que le signataire a vraiment acheté ou vendu d'un token.
 * Sert aux swaps faits après la graduation (Jupiter) : rien n'est cru du client.
 *  - tokens : variation du solde du token pour ce wallet ;
 *  - SOL net : variation du SOL natif + du SOL enveloppé (WSOL) du wallet, frais du réseau retirés.
 */
export type TokenBal = { mint: string; owner?: string; uiTokenAmount: { uiAmountString?: string | null; amount: string } };

const WSOL = "So11111111111111111111111111111111111111112";

export type SwapDelta = { side: "buy" | "sell"; tokenAmount: number; solAmount: number };

export function swapDelta(p: {
  wallet: string; mint: string; feeLamports: number;
  preLamports: number; postLamports: number;
  preTokens: TokenBal[]; postTokens: TokenBal[];
}): SwapDelta | null {
  const sum = (list: TokenBal[], mint: string) =>
    list.filter((b) => b.mint === mint && b.owner === p.wallet).reduce((n, b) => n + Number(b.uiTokenAmount.uiAmountString ?? 0), 0);
  const tokenDelta = sum(p.postTokens, p.mint) - sum(p.preTokens, p.mint);
  const solDelta = (p.postLamports - p.preLamports) / 1e9 + (sum(p.postTokens, WSOL) - sum(p.preTokens, WSOL)) + p.feeLamports / 1e9;
  if (!(tokenDelta !== 0)) return null;
  if (tokenDelta > 0 && solDelta < 0) return { side: "buy", tokenAmount: tokenDelta, solAmount: -solDelta };
  if (tokenDelta < 0 && solDelta > 0) return { side: "sell", tokenAmount: -tokenDelta, solAmount: solDelta };
  return null;
}
