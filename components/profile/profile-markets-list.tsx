"use client";

import { useState } from "react";
import Image from "next/image";
import type { CreatedMarket } from "@/services/profile-service";

const PAGE_SIZE = 10;

function fmt(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)    return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(2);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "open":
      return (
        <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Active
        </span>
      );
    case "resolved":
      return (
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
          Resolved
        </span>
      );
    case "cancelled":
      return (
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
          Cancelled
        </span>
      );
    default:
      return (
        <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          Pending
        </span>
      );
  }
}

function MarketCoverImage({ market }: { market: CreatedMarket }) {
  if (market.cover_image_src) {
    return (
      <div className="size-10 shrink-0 overflow-hidden rounded-full border border-border">
        <Image src={market.cover_image_src} alt={market.title} width={40} height={40} className="size-10 object-cover" />
      </div>
    );
  }
  const letter = market.title.trim()[0]?.toUpperCase() ?? "M";
  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
      {letter}
    </div>
  );
}

function TokenLabel({ token }: { token: "usdc" | "clawdtrust" }) {
  const logo  = token === "usdc" ? "/usdc-coin.png" : "/clawdtrust-coin.png";
  const label = token === "usdc" ? "USDC" : "ClawdTrust";
  return (
    <span className="inline-flex items-center gap-1">
      <Image src={logo} alt={label} width={11} height={11} className="inline-block rounded-full" />
      <span>{label}</span>
    </span>
  );
}

export function ProfileMarketsList({ markets }: { markets: CreatedMarket[] }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(markets.length / PAGE_SIZE);
  const slice = markets.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  if (markets.length === 0) return null;

  const usdcMarkets = markets.filter((m) => m.bet_token === "usdc");
  const cltMarkets  = markets.filter((m) => m.bet_token !== "usdc");

  const totalVolumeUsdc = usdcMarkets.reduce((s, m) => s + m.volume, 0);
  const totalVolumeClt  = cltMarkets.reduce((s, m) => s + m.volume, 0);
  const totalFeesUsdc   = usdcMarkets.reduce((s, m) => s + m.fee_earned, 0);
  const totalFeesClt    = cltMarkets.reduce((s, m) => s + m.fee_earned, 0);
  const totalParticipants = markets.reduce((s, m) => s + m.bet_count, 0);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Markets created
        </p>
        {totalPages > 1 && (
          <span className="text-[10px] text-muted-foreground">{page + 1} / {totalPages}</span>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 divide-x divide-border border-b border-border sm:grid-cols-4">
        <div className="px-4 py-2.5 text-center">
          <p className="text-[10px] text-muted-foreground">Created</p>
          <p className="text-lg font-semibold text-foreground">{markets.length}</p>
        </div>
        <div className="px-4 py-2.5 text-center">
          <p className="text-[10px] text-muted-foreground">Total volume</p>
          {totalVolumeUsdc > 0 && (
            <p className="flex items-center justify-center gap-1 text-sm font-semibold text-foreground">
              <Image src="/usdc-coin.png" alt="USDC" width={11} height={11} className="rounded-full" />
              {fmt(totalVolumeUsdc)}
            </p>
          )}
          {totalVolumeClt > 0 && (
            <p className="flex items-center justify-center gap-1 text-sm font-semibold text-foreground">
              <Image src="/clawdtrust-coin.png" alt="CLT" width={11} height={11} className="rounded-full" />
              {fmt(totalVolumeClt)}
            </p>
          )}
        </div>
        <div className="px-4 py-2.5 text-center">
          <p className="text-[10px] text-muted-foreground">Fees earned (1%)</p>
          {totalFeesUsdc > 0 && (
            <p className="flex items-center justify-center gap-1 text-sm font-semibold text-emerald-600">
              <Image src="/usdc-coin.png" alt="USDC" width={11} height={11} className="rounded-full" />
              +{fmt(totalFeesUsdc)}
            </p>
          )}
          {totalFeesClt > 0 && (
            <p className="flex items-center justify-center gap-1 text-sm font-semibold text-emerald-600">
              <Image src="/clawdtrust-coin.png" alt="CLT" width={11} height={11} className="rounded-full" />
              +{fmt(totalFeesClt)}
            </p>
          )}
          {totalFeesUsdc === 0 && totalFeesClt === 0 && (
            <p className="text-sm font-semibold text-muted-foreground">—</p>
          )}
        </div>
        <div className="hidden px-4 py-2.5 text-center sm:block">
          <p className="text-[10px] text-muted-foreground">Participants</p>
          <p className="text-lg font-semibold text-foreground">{totalParticipants}</p>
        </div>
      </div>

      {/* Market rows */}
      <div className="divide-y divide-border">
        {slice.map((market) => {
          const isUsdc = market.bet_token === "usdc";
          return (
            <div key={market.id} className="flex items-center gap-4 px-4 py-4">
              <MarketCoverImage market={market} />

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium text-foreground">{market.title}</p>
                  <StatusBadge status={market.status} />
                </div>

                {market.status === "resolved" && market.winning_option_label && (
                  <p className="inline-block rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    Winner: <span className="font-semibold text-foreground">{market.winning_option_label}</span>
                  </p>
                )}
                {market.status === "cancelled" && (
                  <p className="text-[11px] text-muted-foreground">One-sided or tied · Refunded</p>
                )}
                {market.status === "pending" && (
                  <p className="text-[11px] text-muted-foreground">Waiting for admin review</p>
                )}

                <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  {fmt(market.volume)}
                  <TokenLabel token={market.bet_token} />
                  {" · "}
                  {market.bet_count} participant{market.bet_count !== 1 ? "s" : ""}
                  {" · "}
                  {fmtDate(market.created_at)}
                </p>
              </div>

              {/* Fee in market token */}
              <div className="shrink-0 text-right">
                {market.fee_earned > 0 ? (
                  <>
                    <p className="flex items-center justify-end gap-1 text-sm font-semibold text-emerald-600">
                      <span>+{isUsdc ? "$" : ""}{fmt(market.fee_earned)}</span>
                      <Image
                        src={isUsdc ? "/usdc-coin.png" : "/clawdtrust-coin.png"}
                        alt={isUsdc ? "USDC" : "ClawdTrust"}
                        width={13}
                        height={13}
                        className="rounded-full"
                      />
                    </p>
                    <p className="text-[10px] text-muted-foreground">fee earned</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-muted-foreground">—</p>
                    <p className="text-[10px] text-muted-foreground">fee earned</p>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-lg px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
          >
            ← Previous
          </button>
          <span className="text-[10px] text-muted-foreground">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, markets.length)} of {markets.length}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="rounded-lg px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
