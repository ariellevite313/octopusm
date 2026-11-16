import type { TerminalToken } from "@/lib/terminal";

/** ClawdTrust ($CLT) : jamais marqué RUG ni analysé. */
export const RUG_EXEMPT = new Set(["DjdyfQGdtiejPhaSgraS1qaiWVhgrEFTSnd9bVnYBAGS"]);

/**
 * Un token est marqué RUG quand son prix chute d'au moins 80 % en 1 h,
 * ou d'au moins 90 % en 24 h avec une liquidité effondrée (moins de 2 000 $).
 */
export function isRug(t: Pick<TerminalToken, "mint" | "change1h" | "change24h" | "liquidity">): boolean {
  if (RUG_EXEMPT.has(t.mint)) return false;
  if (t.change1h != null && t.change1h <= -80) return true;
  if (t.change24h != null && t.change24h <= -90 && (t.liquidity == null || t.liquidity < 2000)) return true;
  return false;
}
