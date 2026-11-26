"use client";

/**
 * Ligne d'infos d'un token dans le Terminal (style Axiom) : âge, réseaux sociaux et recherche sur X, holders,
 * top 10, dev, snipers, insiders, bundlers, LP brûlée ou verrouillée, taxe, autorités mint et freeze, profil DexScreener
 * payé, boosts et transactions de la dernière heure. Une seule ligne qui défile, sans cases.
 * Vert : bon signe · rouge : risque · gris : inconnu. Le nom de chaque info est dans son infobulle.
 */
import { useEffect, useState } from "react";
import { Boxes, ChefHat, Clock, Crosshair, Crown, Flame, Ghost, Globe, Percent, Rocket, Search, Send, ShieldCheck, Snowflake, Users, ArrowLeftRight } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { TerminalChain, TerminalToken } from "@/lib/terminal";
import type { Security } from "@/lib/terminal-security";

type Pct = { wallets: string[]; pct: number } | null;
const SOL_MINT = "So11111111111111111111111111111111111111112";

function age(iso: string | null): string | null {
  if (!iso) return null;
  const m = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `${Math.round(m)}m` : m < 1440 ? `${Math.round(m / 60)}h` : m < 525600 ? `${Math.round(m / 1440)}d` : `${(m / 525600).toFixed(1)}y`;
}
const fmtPct = (n: number) => `${n >= 10 ? n.toFixed(1) : n.toFixed(2)}%`;
const int = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n));

function Item({ label, tone = "muted", href, children }: { label: string; tone?: "good" | "bad" | "muted" | "plain"; href?: string; children: React.ReactNode }) {
  const cls = `inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold ${tone === "good" ? "text-up" : tone === "bad" ? "text-down" : tone === "plain" ? "text-foreground" : "text-muted-foreground"}`;
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer nofollow" title={label} aria-label={label} className={`${cls} hover:text-foreground`}>{children}</a>
    : <span title={label} aria-label={label} className={`num ${cls}`}>{children}</span>;
}
const XIcon = () => <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden><path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8zm-1.1 16.2h1.7L7.4 4.7H5.6z" /></svg>;

export function TokenInsights({ t, chain, mint }: { t: TerminalToken; chain: TerminalChain; mint: string }) {
  const { tr } = useT();
  const [sec, setSec] = useState<Security | null>(null);
  const [bots, setBots] = useState<Pct>(null);
  const [bundle, setBundle] = useState<Pct>(null);
  const sol = chain === "solana" && mint !== SOL_MINT;

  useEffect(() => {
    let off = false;
    setSec(null); setBots(null); setBundle(null);
    if (mint === SOL_MINT) return;
    fetch(`/api/terminal/security?chain=${chain}&mint=${encodeURIComponent(mint)}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (!off && j?.checks) setSec(j as Security); }).catch(() => {});
    if (chain === "solana") {
      fetch(`/api/terminal/bots?mint=${mint}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (!off && d?.available) setBots({ wallets: d.wallets ?? [], pct: Number(d.pct) || 0 }); }).catch(() => {});
      fetch(`/api/launchpad/bundle/${mint}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (!off && d?.available) setBundle({ wallets: d.wallets ?? [], pct: Number(d.pct) || 0 }); }).catch(() => {});
    }
    return () => { off = true; };
  }, [chain, mint]);

  const check = (k: string) => sec?.checks.find((c) => c.key === k) ?? null;
  const tone = (ok: boolean | null | undefined) => (ok == null ? "muted" : ok ? "good" : "bad") as "good" | "bad" | "muted";
  const x = t.dex?.socials.find((s) => s.type === "twitter")?.url;
  const tg = t.dex?.socials.find((s) => s.type === "telegram")?.url;
  const a = age(t.createdAt);
  const top10 = check("top10"), dev = check("dev"), ins = check("insiders"), lp = check("lp"), mintA = check("mint"), freeze = check("freeze");
  const tax = check("fee") ?? check("tax");

  return (
    <div className="scrollbar-none -mx-4 flex items-center gap-4 overflow-x-auto px-4 py-1">
      {a && <Item label={tr("Age")} tone="plain"><Clock className="size-3.5" />{a}</Item>}
      {x && <Item label="X" href={x}><XIcon /></Item>}
      {t.dex?.website && <Item label={tr("Website")} href={t.dex.website}><Globe className="size-3.5" /></Item>}
      {tg && <Item label="Telegram" href={tg}><Send className="size-3.5" /></Item>}
      <Item label={tr("Search on X")} href={`https://x.com/search?q=${encodeURIComponent(mint)}&f=live`}><Search className="size-3.5" /></Item>
      {sec?.holders != null && <Item label={tr("Holders")} tone="plain"><Users className="size-3.5" />{int(sec.holders)}</Item>}
      {top10 && top10.value !== "-" && <Item label={tr("Top 10 holders")} tone={tone(top10.ok)}><Crown className="size-3.5" />{top10.value}</Item>}
      {dev && dev.value !== "-" && <Item label={tr("Dev holds")} tone={tone(dev.ok)}><ChefHat className="size-3.5" />{dev.value}</Item>}
      {sol && bots && <Item label={tr("Snipers")} tone={tone(bots.pct < 10)}><Crosshair className="size-3.5" />{fmtPct(bots.pct)}</Item>}
      {ins && ins.value !== "-" && <Item label={tr("Insiders")} tone={tone(ins.ok)}><Ghost className="size-3.5" />{ins.value}</Item>}
      {sol && bundle && <Item label={tr("Bundlers")} tone={tone(bundle.pct < 10)}><Boxes className="size-3.5" />{bundle.wallets.length}/{fmtPct(bundle.pct)}</Item>}
      {lp && lp.value !== "-" && <Item label={tr("LP locked or burned")} tone={tone(lp.ok)}><Flame className="size-3.5" />{lp.value}</Item>}
      {tax && <Item label={tr("Tax")} tone={tone(tax.ok)}><Percent className="size-3.5" />{tax.value}</Item>}
      {mintA && <Item label={tr("Mint authority")} tone={tone(mintA.ok)}><ShieldCheck className="size-3.5" />{mintA.ok ? tr("Mint off") : tr("Mint on")}</Item>}
      {freeze && <Item label={tr("Freeze authority")} tone={tone(freeze.ok)}><Snowflake className="size-3.5" />{freeze.ok ? tr("Freeze off") : tr("Freeze on")}</Item>}
      {t.dex && <Item label={tr("DexScreener profile")} tone={t.dex.paid ? "good" : "muted"}><span className="text-[12px] font-bold">DS</span>{t.dex.paid ? tr("Paid") : tr("Not paid")}</Item>}
      {(t.dex?.boost ?? 0) > 0 && <Item label={tr("DexScreener boosts")} tone="plain"><Rocket className="size-3.5" />{t.dex!.boost}</Item>}
      {t.txns1h && <Item label={tr("1h TXs")} tone="plain"><ArrowLeftRight className="size-3.5" />{int(t.txns1h.buys + t.txns1h.sells)}<span className="text-up">{int(t.txns1h.buys)}</span>/<span className="text-down">{int(t.txns1h.sells)}</span></Item>}
      {sec?.rugged && <Item label={tr("Rugged")} tone="bad">{tr("Rugged")}</Item>}
    </div>
  );
}
