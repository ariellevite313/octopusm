"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import type { ReferralRow } from "@/services/dashboard-service";
import { useT, Rich } from "@/lib/i18n";
import { LOCALES } from "@/lib/i18n-mark";
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

  return (
    <section>
      <h2 className="mb-3 text-base font-bold text-foreground">{tr("Referral program")}</h2>

      <div className="rounded-[22px] border border-border bg-card overflow-hidden divide-y divide-border">

        {/* Link row */}
        <div className="px-4 py-4 space-y-2">
          <p className="text-[13px] font-semibold text-muted-foreground">
            {tr("Your referral link")}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs font-mono text-foreground">
              {referralLink ?? tr("Generating your link...")}
            </code>
            <button
              type="button"
              disabled={!referralLink}
              onClick={() => void handleCopy()}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-orange-500 px-3 py-2 text-xs font-bold text-white hover:bg-orange-400 disabled:opacity-50 transition-colors btn-primary"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? tr("Copied!") : tr("Copy")}
            </button>
          </div>
          <p className="text-xs text-muted-foreground [&_strong]:font-semibold [&_strong]:text-orange-500">
            <Rich>{tr("Earn <b>200 OMERO</b> for each friend who connects their wallet via your link — they get <b>50 OMERO</b> too.")}</Rich>
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 divide-x divide-border">
          <div className="px-3 py-3 text-center">
            <p className="text-lg font-bold text-foreground">{referralCount}</p>
            <p className="text-[13px] font-semibold text-muted-foreground">
              {tr("Friends")}
            </p>
          </div>
          <div className="px-3 py-3 text-center">
            <p className="text-lg font-bold text-orange-500">{octoEarned.toLocaleString(LOCALES[lang])}</p>
            <p className="text-[13px] font-semibold text-muted-foreground">
              {tr("OMERO earned")}
            </p>
          </div>
          <div className="px-3 py-3 text-center">
            <p className="text-lg font-bold text-foreground">
              {referrals.length > 0
                ? `$${fmtUsdc(referrals.reduce((s, r) => s + r.usdc_commission, 0), lang)}`
                : "—"}
            </p>
            <p className="text-[13px] font-semibold text-muted-foreground">
              USDC
            </p>
          </div>
          <div className="px-3 py-3 text-center">
            <p className="text-lg font-bold text-foreground">
              {referrals.length > 0
                ? fmtClt(referrals.reduce((s, r) => s + r.clt_commission, 0), lang)
                : "—"}
            </p>
            <p className="text-[13px] font-semibold text-muted-foreground">
              CLT
            </p>
          </div>
        </div>

        {/* Referral list */}
        {referrals.length > 0 && (
          <div>
            <div className="grid grid-cols-4 gap-2 px-4 py-2 bg-muted/30">
              <p className="text-[13px] font-semibold text-muted-foreground col-span-2">{tr("User")}</p>
              <p className="text-[13px] font-semibold text-muted-foreground text-right">USDC</p>
              <p className="text-[13px] font-semibold text-muted-foreground text-right">CLT</p>
            </div>
            {referrals.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-4 gap-2 items-center px-4 py-2.5 border-t border-border"
              >
                <div className="col-span-2 min-w-0">
                  <p className="text-xs font-mono text-foreground truncate">{fmtAddr(r.referred_wallet)}</p>
                  <p className="text-[10px] text-muted-foreground">{fmtDate(r.created_at, lang)}</p>
                </div>
                <p className="text-xs font-medium text-right text-foreground">
                  {r.usdc_commission > 0 ? (
                    <span className="text-up">
                      +${fmtUsdc(r.usdc_commission, lang)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </p>
                <p className="text-xs font-medium text-right text-foreground">
                  {r.clt_commission > 0 ? (
                    <span className="text-purple-600 dark:text-purple-400">
                      +{fmtClt(r.clt_commission, lang)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </p>
              </div>
            ))}
          </div>
        )}

        {referralCount === 0 && (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            {tr("No referrals yet — share your link to start earning OMERO.")}
          </div>
        )}
      </div>
    </section>
  );
}
