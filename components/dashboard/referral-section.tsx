"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import type { ReferralRow } from "@/services/dashboard-service";

function fmtUsdc(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtClt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}
function fmtAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ReferralSection({
  referralCode,
  referralCount,
  referrals,
}: {
  referralCode: string | null;
  referralCount: number;
  referrals: ReferralRow[];
}) {
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
      <h2 className="mb-3 text-base font-bold text-foreground">Referral program</h2>

      <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">

        {/* Link row */}
        <div className="px-4 py-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Your referral link
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs font-mono text-foreground">
              {referralLink ?? "Generating your link..."}
            </code>
            <button
              type="button"
              disabled={!referralLink}
              onClick={() => void handleCopy()}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-400 disabled:opacity-50 transition-colors"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Earn <span className="font-semibold text-orange-500">10 OCTO</span> for each friend who connects their wallet via your link.
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 divide-x divide-border">
          <div className="px-3 py-3 text-center">
            <p className="text-lg font-bold text-foreground">{referralCount}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Friends
            </p>
          </div>
          <div className="px-3 py-3 text-center">
            <p className="text-lg font-bold text-orange-500">{referralCount * 10}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              OCTO earned
            </p>
          </div>
          <div className="px-3 py-3 text-center">
            <p className="text-lg font-bold text-foreground">
              {referrals.length > 0
                ? `$${fmtUsdc(referrals.reduce((s, r) => s + r.usdc_commission, 0))}`
                : "—"}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              USDC
            </p>
          </div>
          <div className="px-3 py-3 text-center">
            <p className="text-lg font-bold text-foreground">
              {referrals.length > 0
                ? fmtClt(referrals.reduce((s, r) => s + r.clt_commission, 0))
                : "—"}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              CLT
            </p>
          </div>
        </div>

        {/* Referral list */}
        {referrals.length > 0 && (
          <div>
            <div className="grid grid-cols-4 gap-2 px-4 py-2 bg-muted/30">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground col-span-2">User</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">USDC</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">CLT</p>
            </div>
            {referrals.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-4 gap-2 items-center px-4 py-2.5 border-t border-border"
              >
                <div className="col-span-2 min-w-0">
                  <p className="text-xs font-mono text-foreground truncate">{fmtAddr(r.referred_wallet)}</p>
                  <p className="text-[10px] text-muted-foreground">{fmtDate(r.created_at)}</p>
                </div>
                <p className="text-xs font-medium text-right text-foreground">
                  {r.usdc_commission > 0 ? (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      +${fmtUsdc(r.usdc_commission)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </p>
                <p className="text-xs font-medium text-right text-foreground">
                  {r.clt_commission > 0 ? (
                    <span className="text-purple-600 dark:text-purple-400">
                      +{fmtClt(r.clt_commission)}
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
            No referrals yet — share your link to start earning OCTO.
          </div>
        )}
      </div>
    </section>
  );
}
