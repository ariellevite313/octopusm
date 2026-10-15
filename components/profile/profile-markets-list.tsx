"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { CreatedMarket } from "@/services/profile-service";
import { fmt } from "@/lib/format";
import { ListPager } from "./list-pager";
import { useT } from "@/lib/i18n";
import { LOCALES } from "@/lib/i18n-mark";

const PAGE_SIZE = 5;

function StatusBadge({ status }: { status: string }) {
  const { tr } = useT();
  switch (status) {
    case "open":
      return (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-up/12 px-2 py-0.5 text-[11px] font-semibold text-up">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          {tr("Active")}
        </span>
      );
    case "resolved":
      return (
        <span className="shrink-0 rounded-full bg-sky-500/12 px-2 py-0.5 text-[11px] font-semibold text-sky-600 dark:text-sky-400">
          {tr("Resolved")}
        </span>
      );
    case "cancelled":
      return (
        <span className="shrink-0 rounded-full bg-down/12 px-2 py-0.5 text-[11px] font-semibold text-down">
          {tr("Cancelled")}
        </span>
      );
    default:
      return (
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {tr("Pending")}
        </span>
      );
  }
}

function MarketCoverImage({ market }: { market: CreatedMarket }) {
  if (market.cover_image_src) {
    return (
      <div className="size-10 shrink-0 overflow-hidden rounded-full bg-muted">
        <Image src={market.cover_image_src} alt={market.title} width={40} height={40} className="size-10 object-cover" />
      </div>
    );
  }
  const letter = market.title.trim()[0]?.toUpperCase() ?? "M";
  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground">
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
  const { tr, lang } = useT();
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(LOCALES[lang], { month: "short", day: "numeric", year: "numeric" });
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
    <section>
      <h2 className="mb-3 text-lg font-bold tracking-tight text-foreground">{tr("Markets created")}</h2>

      {/* Summary */}
      <div className="mb-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">{tr("Created")}</p>
          <p className="num text-lg font-bold text-foreground">{markets.length}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{tr("Volume")}</p>
          {totalVolumeUsdc > 0 && (
            <p className="num flex items-center gap-1 text-[15px] font-bold text-foreground">
              <Image src="/usdc-coin.png" alt="USDC" width={12} height={12} className="rounded-full" />
              {fmt(totalVolumeUsdc)}
            </p>
          )}
          {totalVolumeClt > 0 && (
            <p className="num flex items-center gap-1 text-[15px] font-bold text-foreground">
              <Image src="/clawdtrust-coin.png" alt="CLT" width={12} height={12} className="rounded-full" />
              {fmt(totalVolumeClt)}
            </p>
          )}
          {totalVolumeUsdc === 0 && totalVolumeClt === 0 && (
            <p className="num text-lg font-bold text-foreground">0</p>
          )}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{tr("Fees (1%)")}</p>
          {totalFeesUsdc > 0 && (
            <p className="num flex items-center gap-1 text-[15px] font-bold text-up">
              <Image src="/usdc-coin.png" alt="USDC" width={12} height={12} className="rounded-full" />
              +{fmt(totalFeesUsdc)}
            </p>
          )}
          {totalFeesClt > 0 && (
            <p className="num flex items-center gap-1 text-[15px] font-bold text-up">
              <Image src="/clawdtrust-coin.png" alt="CLT" width={12} height={12} className="rounded-full" />
              +{fmt(totalFeesClt)}
            </p>
          )}
          {totalFeesUsdc === 0 && totalFeesClt === 0 && (
            <p className="num text-lg font-bold text-foreground">0</p>
          )}
        </div>
        <div className="hidden sm:block">
          <p className="text-xs text-muted-foreground">{tr("Participants")}</p>
          <p className="num text-lg font-bold text-foreground">{totalParticipants}</p>
        </div>
      </div>

      {/* Market rows */}
      <div>
        {slice.map((market) => {
          const isUsdc = market.bet_token === "usdc";
          return (
            <Link
              key={market.id}
              href={`/pools/${market.slug ?? market.id}`}
              className="-mx-2 flex items-center gap-3 rounded-2xl px-2 py-3 transition-colors hover:bg-muted/50"
            >
              <MarketCoverImage market={market} />

              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-foreground">{market.title}</p>
                <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <StatusBadge status={market.status} />
                  {market.status === "resolved" && market.winning_option_label && (
                    <span className="truncate">
                      {tr("Winner")} <span className="font-semibold text-foreground">{market.winning_option_label}</span>
                    </span>
                  )}
                  {market.status === "cancelled" && <span className="truncate">{tr("Refunded")}</span>}
                  {market.status === "pending" && <span className="truncate">{tr("In review")}</span>}
                </div>
                <p className="mt-1 flex min-w-0 items-center gap-1 truncate whitespace-nowrap text-xs text-muted-foreground">
                  <span className="num">{fmt(market.volume)}</span>
                  <TokenLabel token={market.bet_token} />
                  <span>· {market.bet_count} {market.bet_count === 1 ? tr("bet") : tr("bets")} · {fmtDate(market.created_at)}</span>
                </p>
              </div>

              {/* Fee in market token */}
              <div className="shrink-0 text-right">
                {market.fee_earned > 0 ? (
                  <p className="num flex items-center justify-end gap-1 text-[15px] font-bold text-up">
                    +{isUsdc ? "$" : ""}{fmt(market.fee_earned)}
                    <Image
                      src={isUsdc ? "/usdc-coin.png" : "/clawdtrust-coin.png"}
                      alt={isUsdc ? "USDC" : "ClawdTrust"}
                      width={13}
                      height={13}
                      className="rounded-full"
                    />
                  </p>
                ) : (
                  <p className="num text-[15px] font-bold text-muted-foreground">0</p>
                )}
                <p className="text-[11px] text-muted-foreground">{tr("fees")}</p>
              </div>
            </Link>
          );
        })}
      </div>

      <ListPager page={page} total={totalPages} onChange={setPage} />
    </section>
  );
}
