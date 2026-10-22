"use client";

import { useState } from "react";
import { Copy, Check, UserPlus, TrendingUp, CircleDollarSign, MessageSquare, Users } from "lucide-react";
import type { ReferralRow } from "@/services/dashboard-service";
import { useT } from "@/lib/i18n";
import { LOCALES, T } from "@/lib/i18n-mark";
import type { Lang } from "@/lib/i18n";

function fmtUsdc(n: number, lang: Lang) {
  return n.toLocaleString(LOCALES[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtClt(n: number, lang: Lang) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString(LOCALES[lang]);
}
function fmtAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
function fmtDate(iso: string, lang: Lang) {
  return new Date(iso).toLocaleDateString(LOCALES[lang], { month: "short", day: "numeric", year: "numeric" });
}

export function ReferralSection({
  referralCode,
  referralCount,
  referrals,
  octoEarned,
}: {
  referralCode: string | null;
  referralCount: number;
  referrals: ReferralRow[];
  octoEarned: number;
}) {
  const { tr, lang } = useT();
  const [copied, setCopied] = useState(false);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://octopusmarket.io";
  const referralLink = referralCode ? `${origin}/?ref=${referralCode}` : null;

  async function handleCopy() {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const usdcTotal = referrals.reduce((s, r) => s + r.usdc_commission, 0);
  const cltTotal  = referrals.reduce((s, r) => s + r.clt_commission, 0);
  const WAYS: { icon: typeof UserPlus; title: string; text: string }[] = [
    { icon: UserPlus,      title: T("A friend joins"),        text: T("You get 200 OMERO, they get 50 OMERO.") },
    { icon: TrendingUp,    title: T("They buy tokens"),       text: T("10% of our fee on every buy, for life. Paid in USDC.") },
    { icon: CircleDollarSign, title: T("They predict"),       text: T("1% of every bet they place, in the bet's currency.") },
    { icon: MessageSquare, title: T("You share on the feed"), text: T("1% of our fee when someone buys from your post's Trade button.") },
  ];

  return (
    <section className="space-y-5">
      <div>
        <h2 className="mb-3 text-lg font-extrabold text-foreground">{tr("Referral")}</h2>
        <div className="rounded-3xl border border-border bg-card p-4">
          <p className="mb-2 text-[13px] font-semibold text-muted-foreground">{tr("Your link")}</p>
          <div className="flex items-center gap-2">
            <code className="flex h-12 min-w-0 flex-1 items-center truncate rounded-2xl bg-muted px-3.5 font-mono text-[13px] text-foreground">
              {referralLink ? referralLink.replace(/^https?:\/\//, "") : tr("Generating your link...")}
            </code>
            <button type="button" disabled={!referralLink} onClick={() => void handleCopy()}
              className="flex h-12 shrink-0 items-center gap-2 rounded-2xl bg-foreground px-4 text-sm font-bold text-background transition-opacity hover:opacity-90 disabled:opacity-40">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? tr("Copied!") : tr("Copy")}
            </button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              { v: String(referralCount), l: T("Friends") },
              { v: `$${fmtUsdc(usdcTotal, lang)}`, l: T("USDC earned") },
              { v: octoEarned.toLocaleString(LOCALES[lang]), l: "OMERO" },
            ].map((x) => (
              <div key={x.l} className="rounded-2xl bg-muted px-2 py-3 text-center">
                <p className="text-lg font-extrabold text-foreground">{x.v}</p>
                <p className="text-xs text-muted-foreground">{tr(x.l)}</p>
              </div>
            ))}
          </div>
          {cltTotal > 0 && <p className="mt-2 text-center text-xs text-muted-foreground">+ {fmtClt(cltTotal, lang)} CLT</p>}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-lg font-extrabold text-foreground">{tr("How you earn")}</h3>
        <div className="divide-y divide-border rounded-3xl border border-border bg-card px-4">
          {WAYS.map((w) => (
            <div key={w.title} className="flex gap-3 py-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                <w.icon className="size-[18px] text-foreground" strokeWidth={1.8} />
              </span>
              <div>
                <p className="text-[15px] font-bold text-foreground">{tr(w.title)}</p>
                <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{tr(w.text)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-lg font-extrabold text-foreground">{tr("Your friends")}</h3>
        <div className="rounded-3xl border border-border bg-card">
          {referrals.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <span className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-muted">
                <Users className="size-[18px] text-foreground" strokeWidth={1.8} />
              </span>
              <p className="text-[15px] font-bold text-foreground">{tr("No friends yet")}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{tr("Share your link. Each friend shows here with what you earned from them.")}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {referrals.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[13px] font-semibold text-foreground">{fmtAddr(r.referred_wallet)}</p>
                    <p className="text-xs text-muted-foreground">{fmtDate(r.created_at, lang)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${r.usdc_commission > 0 ? "text-up" : "text-muted-foreground"}`}>
                      {r.usdc_commission > 0 ? `+$${fmtUsdc(r.usdc_commission, lang)}` : "$0.00"}
                    </p>
                    {r.clt_commission > 0 && <p className="text-xs text-muted-foreground">+{fmtClt(r.clt_commission, lang)} CLT</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
