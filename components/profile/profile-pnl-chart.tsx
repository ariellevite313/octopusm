"use client";

import { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { PnlPoint } from "@/services/profile-service";
import { fmt as formatAmount } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import { T, LOCALES } from "@/lib/i18n-mark";

interface Props {
  series:    PnlPoint[];
  totalUsdc: number;
  totalClt:  number;
  volumeUsdc?: number;
  volumeClt?:  number;
  totalUsd?:   number;
  wonUsd?:     number;
}

type Range = "1W" | "1M" | "ALL";
type Token = "usd" | "usdc" | "clt";

const RANGES: Range[] = ["1W", "1M", "ALL"];
const RANGE_LABELS: Record<Range, string> = { "1W": T("1W"), "1M": T("1M"), "ALL": T("ALL") };

const TOKEN_CONFIG = {
  usd: {
    label:       "USD",
    unit:        "$",
    dataKey:     "usd" as const,
    color:       "#22c55e",
    activeBg:    "rgba(34, 197, 94, 0.14)",
    activeText:  "#22c55e",
    activeBorder:"transparent",
    dotColor:    "#22c55e",
  },
  usdc: {
    label:       "USDC",
    unit:        "USDC",
    dataKey:     "usdc" as const,
    color:       "#22c55e",
    activeBg:    "rgba(247, 107, 16, 0.14)",
    activeText:  "#f76b10",
    activeBorder:"transparent",
    dotColor:    "#2775ca",
  },
  clt: {
    label:       "ClawdTrust",
    unit:        "CLT",
    dataKey:     "clt" as const,
    color:       "#8b84e8",
    activeBg:    "rgba(127, 119, 221, 0.16)",
    activeText:  "#8b84e8",
    activeBorder:"transparent",
    dotColor:    "#7F77DD",
  },
} as const;

function formatDate(dateStr: string, lang: Lang): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString(LOCALES[lang], { month: "short", day: "numeric", timeZone: "UTC" });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label, unit, positiveColor }: any) {
  if (!active || !payload?.length) return null;
  const val: number = payload[0]?.value ?? 0;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-muted-foreground">{label}</p>
      <p className="font-semibold" style={{ color: val >= 0 ? positiveColor : "#ef4444" }}>
        {unit === "$" ? `${val >= 0 ? "+" : "-"}$${formatAmount(Math.abs(val))}` : `${val >= 0 ? "+" : ""}${formatAmount(val)} ${unit}`}
      </p>
    </div>
  );
}

function filterSeries(series: PnlPoint[], range: Range): PnlPoint[] {
  if (range === "ALL" || series.length === 0) return series;
  const days = range === "1W" ? 7 : 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const filtered = series.filter(p => p.date >= cutoffStr);
  return filtered.length > 0 ? filtered : series.slice(-1);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function ProfilePnlChart({ series, totalUsdc, totalClt, volumeUsdc, volumeClt, totalUsd = 0, wonUsd = 0 }: Props) {
  const { tr, lang } = useT();
  const [activeToken, setActiveToken] = useState<Token>("usd");
  const [range, setRange] = useState<Range>("1W");

  const cfg   = TOKEN_CONFIG[activeToken];
  const total = activeToken === "usd" ? totalUsd : activeToken === "usdc" ? totalUsdc : totalClt;
  const vol   = activeToken === "usd" ? undefined : activeToken === "usdc" ? volumeUsdc : volumeClt;

  const filtered = useMemo(() => filterSeries(series, range), [series, range]);

  const data = filtered.map(p => ({
    date:  formatDate(p.date, lang),
    value: Number(p[cfg.dataKey].toFixed(4)),
  }));

  const isPositive = total >= 0;
  const mainColor  = isPositive ? cfg.color : "#ef4444";
  const gradId     = `grad-profile-${activeToken}`;

  function handleTokenSwitch(token: Token) {
    setActiveToken(token);
    setRange("1W");
  }

  return (
    <div className="pt-1">

      {/* Token selector pills */}
      <div className="flex gap-2 mb-4">
        {(["usd", "usdc", "clt"] as Token[]).map(token => {
          const c       = TOKEN_CONFIG[token];
          const isActive = activeToken === token;
          return (
            <button
              key={token}
              onClick={() => handleTokenSwitch(token)}
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-bold transition-all"
              style={isActive ? {
                border:     `1.5px solid ${c.activeBorder}`,
                background: c.activeBg,
                color:      c.activeText,
              } : {
                border:     "1.5px solid transparent",
                background: "transparent",
                color:      "var(--muted-foreground)",
              }}
            >
              <span
                className="inline-block size-2.5 rounded-full shrink-0"
                style={{ background: c.dotColor }}
              />
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Header: total + range selector */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm text-muted-foreground mb-0.5">{tr("Profit/Loss · {token}", { token: cfg.label })}</p>
          <p className="num text-[40px] leading-[1.05] font-bold tracking-[-0.035em]" style={{ color: mainColor }}>
            {activeToken === "usd"
              ? <>{isPositive ? "+" : "-"}${formatAmount(Math.abs(total))}</>
              : <>{isPositive ? "+" : ""}{formatAmount(total)}{" "}
                  <span className="text-lg font-semibold text-muted-foreground">{cfg.unit}</span></>}
          </p>
          {activeToken === "usd" && wonUsd > 0 && (
            <p className="num text-[13px] text-muted-foreground mt-1">
              {tr("Total won: ${amount}", { amount: formatAmount(wonUsd) })}
            </p>
          )}
          {vol !== undefined && vol > 0 && (
            <p className="num text-[13px] text-muted-foreground mt-1">
              {tr("Volume : {amount} {unit}", { amount: formatAmount(vol), unit: cfg.unit })}
            </p>
          )}
        </div>

        <div className="flex shrink-0 gap-0.5 rounded-full border border-border p-1">
          {RANGES.map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-full px-3 py-1 text-[13px] font-bold transition-colors ${
                range === r
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tr(RANGE_LABELS[r])}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {data.length === 0 ? (
        <div className="chart-dots flex h-44 items-center justify-center rounded-2xl text-sm text-muted-foreground">
          {tr("No data")}
        </div>
      ) : (
        <div className="chart-dots -mx-1 rounded-2xl">
        <ResponsiveContainer width="100%" height={190}>
          <AreaChart data={data} margin={{ top: 12, right: 6, left: 6, bottom: 4 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={mainColor} stopOpacity={0.18} />
                <stop offset="95%" stopColor={mainColor} stopOpacity={0}   />
              </linearGradient>
            </defs>
            <XAxis
              hide
              dataKey="date"
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              hide
              domain={["auto", "auto"]}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatAmount}
            />
            <Tooltip content={<CustomTooltip unit={cfg.unit} positiveColor={cfg.color} />} />
            <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="4 4" />
            <Area
              type="monotone"
              dataKey="value"
              stroke={mainColor}
              strokeWidth={2.5}
              fill={`url(#${gradId})`}
              dot={false}
              activeDot={{ r: 5, fill: mainColor, stroke: "var(--background)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
