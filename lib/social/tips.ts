/**
 * Tips en OMERO sur les posts. Les règles sont vérifiées dans la base (fonction send_post_tip), sous un verrou
 * par envoyeur : le serveur ne fait que transmettre le wallet de la session, jamais une valeur venue de la page.
 */

/** Ancienneté minimale du compte qui envoie (jours). */
export const TIP_MIN_ACCOUNT_DAYS = 30;
/** Nombre de tips maximum par heure et par compte. */
export const TIP_HOURLY_MAX = 30;
/** Total d'OMERO envoyables par 24 h et par compte (et donc montant maximum d'un tip). */
export const TIP_DAILY_CAP = 500;
/** Monnaies acceptées. OMUSD (stablecoin de la plateforme) viendra plus tard. */
export const TIP_CURRENCIES = ["omero"] as const;
export type TipCurrency = (typeof TIP_CURRENCIES)[number];

export type TipErrorCode =
  | "not_authenticated" | "invalid_amount" | "post_not_found" | "self_tip" | "account_too_new"
  | "no_activity" | "rate_limited" | "daily_cap" | "insufficient_balance" | "currency_unavailable";

export const TIP_ERRORS: Record<TipErrorCode, { status: number; message: string }> = {
  not_authenticated:    { status: 401, message: "Not authenticated" },
  invalid_amount:       { status: 400, message: `Enter a whole amount between 1 and ${TIP_DAILY_CAP} OMERO` },
  post_not_found:       { status: 404, message: "Post not found" },
  self_tip:             { status: 400, message: "You can't tip your own post" },
  account_too_new:      { status: 403, message: `Tips unlock when your account is at least ${TIP_MIN_ACCOUNT_DAYS} days old` },
  no_activity:          { status: 403, message: "Tips unlock after you create an approved market or launch a token" },
  rate_limited:         { status: 429, message: "Too many tips this hour, try again later" },
  daily_cap:            { status: 429, message: `You can send up to ${TIP_DAILY_CAP} OMERO per 24 hours` },
  insufficient_balance: { status: 400, message: "Not enough OMERO" },
  currency_unavailable: { status: 400, message: "This currency is not available yet" },
};

/** Valide le montant et la monnaie avant d'appeler la base (la base revérifie tout). */
export function checkTipInput(amount: unknown, currency: unknown): TipErrorCode | null {
  if (currency !== undefined && !(TIP_CURRENCIES as readonly unknown[]).includes(currency)) return "currency_unavailable";
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 1 || amount > TIP_DAILY_CAP) return "invalid_amount";
  return null;
}

export type TipResult = { ok: true; post_total: number; balance: number; recipient: string } | { error: TipErrorCode };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendTip(admin: any, sender: string, postId: string, amount: number): Promise<TipResult> {
  const { data, error } = await admin.rpc("send_post_tip", {
    p_sender: sender, p_post: postId, p_amount: amount,
    p_min_age_days: TIP_MIN_ACCOUNT_DAYS, p_hourly_max: TIP_HOURLY_MAX, p_daily_cap: TIP_DAILY_CAP,
  });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as { ok?: boolean; error?: string; post_total?: number; balance?: number; recipient?: string };
  if (r.ok) return { ok: true, post_total: Number(r.post_total ?? 0), balance: Number(r.balance ?? 0), recipient: String(r.recipient ?? "") };
  const code = (r.error && r.error in TIP_ERRORS ? r.error : "invalid_amount") as TipErrorCode;
  return { error: code };
}

/** 1234 → 1.2K, 12400 → 12.4K, 1250000 → 1.3M. Toujours court, pour tenir sur une ligne. */
export function compactCount(n: number): string {
  const v = Math.max(0, Math.floor(n || 0));
  if (v < 1000) return String(v);
  const fmt = (x: number, unit: string) => `${x >= 100 ? Math.floor(x) : Math.floor(x * 10) / 10}${unit}`;
  if (v < 1_000_000) return fmt(v / 1000, "K");
  if (v < 1_000_000_000) return fmt(v / 1_000_000, "M");
  return fmt(v / 1_000_000_000, "B");
}
