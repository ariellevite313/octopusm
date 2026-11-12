/** Plafonds et permissions des wallets d'IA (côté pur, testable). La vérification qui fait foi est en SQL (agent_wallet_reserve). */
export type AgentKind = "swap" | "trade" | "launch" | "bet" | "market";
export const DEFAULT_MAX_ACTION_USD = 50;
export const DEFAULT_MAX_DAY_USD = 200;

export const RESERVE_ERRORS: Record<string, string> = {
  not_found: "No AI wallet for this connection. Ask your human to create one in Connected apps.",
  paused: "Your AI wallet is paused by your human.",
  not_allowed: "Your human did not allow this kind of action for your wallet.",
  bad_amount: "Invalid amount",
  over_action_limit: "This is above the limit per action set by your human.",
  over_day_limit: "This would go over today's spending limit set by your human.",
};

export function parseLimits(b: Record<string, unknown>): { ok: true; v: Record<string, number | boolean> } | { ok: false; error: string } {
  const v: Record<string, number | boolean> = {};
  for (const [k, max] of [["max_action_usd", 10_000], ["max_day_usd", 50_000]] as const) {
    if (b[k] === undefined) continue;
    const n = Number(b[k]);
    if (!Number.isFinite(n) || n <= 0 || n > max) return { ok: false, error: `${k} must be between 0 and ${max}` };
    v[k] = Math.round(n * 100) / 100;
  }
  if (typeof v.max_action_usd === "number" && typeof v.max_day_usd === "number" && v.max_action_usd > v.max_day_usd) {
    return { ok: false, error: "The limit per action cannot be above the daily limit" };
  }
  for (const k of ["allow_trade", "allow_launch", "allow_bet", "paused"]) {
    if (b[k] === undefined) continue;
    if (typeof b[k] !== "boolean") return { ok: false, error: `${k} must be true or false` };
    v[k] = b[k] as boolean;
  }
  return { ok: true, v };
}
