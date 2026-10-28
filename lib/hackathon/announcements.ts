/** Annonces du hackathon : quoi envoyer et quand. Fonctions pures (la base est lue ailleurs). */
import { HACKATHON } from "./config";
import { TIERS } from "./scoring";

export type Plan = { series: string; key: string; template: string; vars: Record<string, string | number>; href: string; publishAt: string };

const DAY = 86_400_000;
const START = Date.parse(HACKATHON.startsAt);
const END = Date.parse(HACKATHON.endsAt);
const ANNOUNCE_AT = START - DAY;             // 23 novembre
const PAYOUT = Date.parse(HACKATHON.payoutAt);
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Ce qui doit exister à cet instant. L'insertion est idempotente (series + key uniques). */
export function plannedAnnouncements(nowMs: number, ctx: { poolUsd: number; topProject?: string | null }): Plan[] {
  const out: Plan[] = [];
  const href = "/hackathon";
  if (nowMs >= ANNOUNCE_AT && nowMs < PAYOUT + DAY) {
    out.push({ series: "hackathon-milestone", key: "announce", template: "announce", vars: {}, href, publishAt: new Date(ANNOUNCE_AT).toISOString() });
  }
  if (nowMs >= START) out.push({ series: "hackathon-milestone", key: "opened", template: "opened", vars: {}, href, publishAt: new Date(START).toISOString() });
  const week = Math.floor((END - 7 * DAY) / DAY) * DAY; // début de la journée, 7 jours avant la fin
  if (nowMs >= week && nowMs <= END) out.push({ series: "hackathon-milestone", key: "week_left", template: "week_left", vars: {}, href, publishAt: new Date(week).toISOString() });
  const lastDay = END - DAY + 1000;
  if (nowMs >= lastDay && nowMs <= END) out.push({ series: "hackathon-milestone", key: "last_day", template: "last_day", vars: {}, href, publishAt: new Date(lastDay).toISOString() });
  if (nowMs > END) out.push({ series: "hackathon-milestone", key: "ended", template: "ended", vars: {}, href, publishAt: new Date(END).toISOString() });
  if (nowMs >= PAYOUT) out.push({ series: "hackathon-milestone", key: "paid", template: "paid", vars: {}, href, publishAt: new Date(PAYOUT).toISOString() });

  // Palier de cagnotte franchi
  for (const t of TIERS) {
    if (nowMs >= START && ctx.poolUsd >= t) out.push({ series: "hackathon-milestone", key: `tier_${t}`, template: "tier", vars: { amount: t }, href: "/hackathon/classement", publishAt: new Date(nowMs).toISOString() });
  }

  // Rappel du jour (remplace celui de la veille) : du 23 novembre jusqu'à la fin
  if (nowMs >= ANNOUNCE_AT && nowMs <= END) {
    const daysLeft = Math.max(0, Math.ceil((END - nowMs) / DAY));
    const open = nowMs >= START;
    out.push({
      series: "hackathon-daily", key: dayKey(nowMs), href: open ? "/hackathon/classement" : href, publishAt: new Date(nowMs).toISOString(),
      template: open ? (ctx.topProject ? "daily_top" : "daily") : "daily_before",
      vars: { days: open ? daysLeft : Math.max(1, Math.ceil((START - nowMs) / DAY)), pool: Math.round(ctx.poolUsd), top: ctx.topProject ?? "" },
    });
  }
  return out;
}

type Tr = (s: string, v?: Record<string, string | number>) => string;

/** Texte d'une annonce, dans la langue de l'utilisateur. */
export function renderAnnouncement(template: string, vars: Record<string, string | number>, tr: Tr): { title: string; body: string; cta: string } {
  const title = tr("OM Builders Hackathon");
  const cta = tr("See the hackathon");
  const fmt = (n: unknown) => `${Number(n).toLocaleString("fr-FR").replace(/ /g, " ")} $`;
  switch (template) {
    case "announce": return { title, cta, body: tr("The hackathon opens tomorrow. Up to 100,000 USDC to win. Launch your token on OM and apply, or back a project by buying its token: $1 invested = 1 vote, and your votes earn you a share of the prize if the project wins.") };
    case "opened": return { title, cta, body: tr("The hackathon is open. Apply, or vote for a project by buying its token.") };
    case "week_left": return { title, cta, body: tr("One week left. Applications and votes close on December 24.") };
    case "last_day": return { title, cta, body: tr("Last day of the hackathon. It ends tonight at midnight (UTC).") };
    case "ended": return { title, cta, body: tr("The hackathon is over. Results are coming. Prizes are paid on December 25.") };
    case "paid": return { title, cta, body: tr("Prizes are paid. Thank you to all builders and voters.") };
    case "tier": return { title, cta, body: tr("The prize pool just passed {amount}.", { amount: fmt(vars.amount) }) };
    case "daily_before": return { title, cta, body: tr("The hackathon opens in {days} days. Up to 100,000 USDC to win.", { days: vars.days }) };
    case "daily_top": return { title, cta, body: tr("{days} days left. Prize pool so far: {pool}. Leading project: {top}.", { days: vars.days, pool: fmt(vars.pool), top: String(vars.top) }) };
    default: return { title, cta, body: tr("{days} days left. Prize pool so far: {pool}.", { days: vars.days, pool: fmt(vars.pool) }) };
  }
}
