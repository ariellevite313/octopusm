/** Pool « prédiction sur un token » proposé directement sur la page du token (cible de capitalisation, date de clôture). */

/** Prochaine cible ronde : environ 2 fois la capitalisation actuelle (1, 2 ou 5 × 10^n). */
export function nextTarget(mcap: number | null): number {
  if (!mcap || mcap <= 0) return 1_000_000;
  const x = mcap * 2;
  const p = 10 ** Math.floor(Math.log10(x));
  const m = x / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

export const moneyShort = (n: number) => (n >= 1e9 ? `$${+(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${+(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${+(n / 1e3).toFixed(1)}K` : `$${Math.round(n)}`);

/** Clôture : dans 24 h, arrondie à l'heure (UTC) */
export function closeIn24h(now = Date.now()): Date {
  const d = new Date(now + 24 * 3_600_000);
  d.setUTCMinutes(0, 0, 0);
  return d;
}

export function tokenPoolTitle(symbol: string, target: number, close: Date): string {
  const when = close.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", hour12: false });
  return `Will $${symbol} reach ${moneyShort(target)} market cap before ${when} UTC?`;
}
