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

interface Props {
  series:    PnlPoint[];
  totalUsdc: number;
  totalClt:  number;
  volumeUsdc?: number;
  volumeClt?:  number;
}

type Range = "1W" | "1M" | "ALL";
type Token = "usdc" | "clt";

const RANGES: Range[] = ["1W", "1M", "ALL"];

const TOKEN_CONFIG = {
  usdc: {
    label:       "USDC",
    unit:        "USDC",
    dataKey:     "usdc" as const,
    color:       "#f97316",
    activeBg:    "#fff7f0",
    activeText:  "#c2540a",
    activeBorder:"#f97316",
    dotColor:    "#2775ca",
  },
  clt: {
    label:       "ClawdTrust",
    unit:        "CLT",
    dataKey:     "clt" as const,
    color:       "#7F77DD",
    activeBg:    "#EEEDFE",
    activeText:  "#3C3489",
    activeBorder:"#7F77DD",
    dotColor:    "#7F77DD",
  },
} as const;

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label, unit, positiveColor }: any) {
  if (!active || !payload?.length) return null;
  const val: number = payload[0]?.value ?? 0;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-muted-foreground">{label}</p>
      <p className="font-semibold" style={{ color: val >= 0 ? positiveColor : "#ef4444" }}>
        {val >= 0 ? "+" : ""}{formatAmount(val)} {unit}
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

export function ProfilePnlChart({ series, totalUsdc, totalClt, volumeUsdc, volumeClt }: Props) {
  const [activeToken, setActiveToken] = useState<Token>("usdc");
  const [range, setRange] = useState<Range>("1W");

  const cfg   = TOKEN_CONFIG[activeToken];
  const total = activeToken === "usdc" ? totalUsdc : totalClt;
  const vol   = activeToken === "usdc" ? volumeUsdc : volumeClt;

  const filtered = useMemo(() => filterSeries(series, range), [series, range]);

  const data = filtered.map(p => ({
    date:  formatDate(p.date),
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
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">

      {/* Token selector pills */}
      <div className="flex gap-2 mb-4">
        {(["usdc", "clt"] as Token[]).map(token => {
          const c       = TOKEN_CONFIG[token];
          const isActive = activeToken === token;
          return (
            <button
              key={token}
              onClick={() => handleTokenSwitch(token)}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all"
              style={isActive ? {
                border:     `1.5px solid ${c.activeBorder}`,
                background: c.activeBg,
                color:      c.activeText,
              } : {
                border:     "0.5px solid var(--border)",
                background: "transparent",
                color:      "var(--text-secondary)",
              }}
            >
              <span
                className="inline-block size-3 rounded-full shrink-0"
                style={{ background: c.dotColor }}
              />
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Header: total + range selector */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Profit/Loss · {cfg.label}</p>
          <p className="text-2xl font-bold" style={{ color: mainColor }}>
            {isPositive ? "+" : ""}{formatAmount(total)}{" "}
            <span className="text-sm font-normal text-muted-foreground">{cfg.unit}</span>
          </p>
          {vol !== undefined && vol > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Volume : {formatAmount(vol)} {cfg.unit}
            </p>
          )}
        </div>

        <div className="flex gap-0.5 rounded-lg bg-muted p-0.5 shrink-0">
          {RANGES.map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                range === r
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {data.length === 0 ? (
        <div className="flex h-28 items-center justify-center text-sm text-muted-foreground">
          No data
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={130}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={mainColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={mainColor} stopOpacity={0}   />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
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
              strokeWidth={2}
              fill={`url(#${gradId})`}
              dot={false}
              activeDot={{ r: 4, fill: mainColor }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
