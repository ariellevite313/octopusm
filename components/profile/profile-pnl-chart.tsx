"use client";

import { useState, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { PnlPoint } from "@/services/profile-service";
import { fmt as formatAmount } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import { T, LOCALES } from "@/lib/i18n-mark";

interface Props {
  series: PnlPoint[];
  /** Total gagné en dollars (prédictions + launchpad), un seul montant */
  totalUsd: number;
  /** Détails sous le total (facultatifs) */
  launchpadUsd?: number;
  marketFeesUsd?: number;
  openCount?: number;
  openStakeUsd?: number;
}

type Range = "1W" | "1M" | "ALL";
const RANGES: Range[] = ["1W", "1M", "ALL"];
const RANGE_LABELS: Record<Range, string> = { "1W": T("1W"), "1M": T("1M"), "ALL": T("ALL") };
const COLOR = "#22c55e";

function formatDate(dateStr: string, lang: Lang): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString(LOCALES[lang], { month: "short", day: "numeric", timeZone: "UTC" });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const val: number = payload[0]?.value ?? 0;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-muted-foreground">{label}</p>
      <p className="font-semibold" style={{ color: COLOR }}>${formatAmount(val)}</p>
    </div>
  );
}

function filterSeries(series: PnlPoint[], range: Range): PnlPoint[] {
  if (range === "ALL" || series.length === 0) return series;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (range === "1W" ? 7 : 30));
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const filtered = series.filter(p => p.date >= cutoffStr);
  return filtered.length > 0 ? filtered : series.slice(-1);
}

export function ProfilePnlChart({ series, totalUsd, launchpadUsd = 0, marketFeesUsd = 0, openCount = 0, openStakeUsd = 0 }: Props) {
  const { tr, lang } = useT();
  const [range, setRange] = useState<Range>("ALL");

  const filtered = useMemo(() => filterSeries(series, range), [series, range]);
  const data = filtered.map(p => ({ date: formatDate(p.date, lang), value: Number(p.usd.toFixed(2)) }));

  return (
    <div className="pt-1">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm text-muted-foreground mb-0.5">{tr("Total earned")}</p>
          <p className="num text-[40px] leading-[1.05] font-bold tracking-[-0.035em]" style={{ color: COLOR }}>
            ${formatAmount(totalUsd)}
          </p>
          <div className="num mt-1.5 space-y-0.5 text-[13px] text-muted-foreground">
            {launchpadUsd > 0 && <p>{tr("Launchpad fees: ${amount}", { amount: formatAmount(launchpadUsd) })}</p>}
            {marketFeesUsd > 0 && <p>{tr("Market creator fees: ${amount}", { amount: formatAmount(marketFeesUsd) })}</p>}
            {openCount > 0 && <p>{tr("Open positions: {count} (${amount} staked)", { count: openCount, amount: formatAmount(openStakeUsd) })}</p>}
          </div>
        </div>
        <div className="flex shrink-0 gap-0.5 rounded-full border border-border p-1">
          {RANGES.map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-full px-3 py-1 text-[13px] font-bold transition-colors ${
                range === r ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tr(RANGE_LABELS[r])}
            </button>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <div className="chart-dots flex h-44 items-center justify-center rounded-2xl text-sm text-muted-foreground">
          {tr("No data")}
        </div>
      ) : (
        <div className="chart-dots -mx-1 rounded-2xl">
          <ResponsiveContainer width="100%" height={190}>
            <AreaChart data={data} margin={{ top: 12, right: 6, left: 6, bottom: 4 }}>
              <defs>
                <linearGradient id="grad-profile-earned" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLOR} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={COLOR} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis hide dataKey="date" />
              <YAxis hide domain={[0, "auto"]} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke={COLOR}
                strokeWidth={2.5}
                fill="url(#grad-profile-earned)"
                dot={false}
                activeDot={{ r: 5, fill: COLOR, stroke: "var(--background)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
