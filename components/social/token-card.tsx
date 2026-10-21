"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { fmt } from "@/lib/format";
import type { TokenCard as Card, Range } from "@/lib/social/token-card";
import { TradeSheet } from "./trade-sheet";

const RANGES: Range[] = ["1H", "1D", "1W", "ALL"];

export function Chart({ points, up }: { points: number[]; up: boolean }) {
  const w = 300, h = 72;
  const d = useMemo(() => {
    if (points.length < 2) return null;
    const min = Math.min(...points), max = Math.max(...points), span = max - min || 1;
    const xs = (i: number) => (i / (points.length - 1)) * w;
    const ys = (v: number) => h - 4 - ((v - min) / span) * (h - 10);
    const line = points.map((v, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)} ${ys(v).toFixed(1)}`).join(" ");
    return { line, area: `${line} L${w} ${h} L0 ${h}Z` };
  }, [points]);
  const color = up ? "var(--up, #22c55e)" : "var(--down, #ef4444)";
  const id = up ? "tc-up" : "tc-down";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-[72px] w-full">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {d ? (
        <>
          <path d={d.area} fill={`url(#${id})`} />
          <path d={d.line} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </>
      ) : (
        <line x1="0" y1={h / 2} x2={w} y2={h / 2} stroke="currentColor" strokeOpacity=".2" strokeDasharray="4 4" />
      )}
    </svg>
  );
}

/** Carte token d'une publication : graphe, market cap, montant détenu et bénéfice de l'auteur. */
export function TokenCardView({ ticker, author }: { ticker: string; author: string }) {
  const { tr } = useT();
  const [card, setCard] = useState<Card | null>(null);
  const [failed, setFailed] = useState(false);
  const [range, setRange] = useState<Range>("1D");
  const [trade, setTrade] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/token-card?ticker=${encodeURIComponent(ticker)}&wallet=${encodeURIComponent(author)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((c: Card) => live && setCard(c))
      .catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [ticker, author]);

  if (failed) return null;
  if (!card) return <div className="mt-3 h-40 animate-pulse rounded-2xl bg-muted/30" />;

  const pts = card.series[range].length >= 2 ? card.series[range] : card.series.ALL;
  const up = pts.length < 2 || pts[pts.length - 1] >= pts[0];
  const t = card.token;
  const href = `/launchpad/${t.mint_address ?? t.id}`;

  return (
    <div className="mt-3">
      <div className="flex items-center gap-3">
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-3">
          {t.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.logo_url} alt="" className="size-9 shrink-0 rounded-full bg-muted object-cover" />
          ) : (
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold">{t.name[0]?.toUpperCase()}</div>
          )}
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold text-foreground">{t.name}</p>
            <p className="truncate text-xs text-muted-foreground">${t.ticker} · {t.chain === "arc" ? "Arc" : "Solana"}</p>
          </div>
        </Link>
        <div className="shrink-0 text-right">
          <p className="text-[11px] text-muted-foreground">{tr("Market cap")}</p>
          <p className="num text-sm font-bold text-foreground">{t.market_cap_usd != null ? `$${fmt(t.market_cap_usd, 0)}` : "—"}</p>
        </div>
      </div>

      <Chart points={pts} up={up} />

      <div className="mt-1 flex gap-1.5">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold transition-colors ${range === r ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
          >
            {r}
          </button>
        ))}
      </div>

      {card.holds_usd != null && (
        <div className="num mt-3 grid grid-cols-3 border-t border-border pt-3 text-[11px] text-muted-foreground">
          <div>
            <p>{tr("Holds")}</p>
            <p className="mt-0.5 text-[15px] font-bold text-foreground">${fmt(card.holds_usd)}</p>
          </div>
          {card.profit_usd != null && (
            <div>
              <p>{tr("Profit")}</p>
              <p className={`mt-0.5 text-[15px] font-bold ${card.profit_usd >= 0 ? "text-up" : "text-down"}`}>
                {card.profit_usd >= 0 ? "+" : "-"}${fmt(Math.abs(card.profit_usd))}
              </p>
            </div>
          )}
          {card.return_pct != null && (
            <div className="text-right">
              <p>{tr("Return")}</p>
              <p className={`mt-0.5 text-[15px] font-bold ${card.return_pct >= 0 ? "text-up" : "text-down"}`}>
                {card.return_pct >= 0 ? "+" : ""}{fmt(card.return_pct, 0)}%
              </p>
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setTrade(true)}
        className="mt-3 h-11 w-full rounded-full bg-primary text-[15px] font-bold text-white transition-opacity hover:opacity-90"
      >
        {tr("Trade")} ${t.ticker}
      </button>
      {trade && <TradeSheet token={t} onClose={() => setTrade(false)} />}
    </div>
  );
}
