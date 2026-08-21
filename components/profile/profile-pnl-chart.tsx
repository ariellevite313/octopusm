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

interface Props {
  series:    PnlPoint[];
  totalUsdc: number;
  totalClt:  number;
  volumeUsdc?: number;
  volumeClt?:  number;
}

type Range = "1W" | "1M" | "ALL";

const RANGES: Range[] = ["1W", "1M", "ALL"];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatAmount(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000)      return `${(n / 1000).toFixed(1)}k`;
  return n.toFixed(2);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  const val: number = payload[0]?.value ?? 0;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-muted-foreground">{label}</p>
      <p className="font-semibold" style={{ color: val >= 0 ? "#f97316" : "#ef4444" }}>
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

// ── Single token chart card ───────────────────────────────────────────────────

interface ChartCardProps {
  label:      string;   // "USDC" | "ClawdTrust"
  unit:       string;   // "USDC" | "CLT"
  total:      number;
  volume?:    number;
  series:     PnlPoint[];
  dataKey:    "usdc" | "clt";
  color:      string;   // main color
}

function ChartCard({ label, unit, total, volume, series, dataKey, color }: ChartCardProps) {
  const [range, setRange] = useState<Range>("1W");

  const filtered = useMemo(() => filterSeries(series, range), [series, range]);

  const data = filtered.map(p => ({
    date:  formatDate(p.date),
    value: Number(p[dataKey].toFixed(4)),
  }));

  const isPositive = total >= 0;
  const mainColor  = isPositive ? color : "#ef4444";
  const gradId     = `grad-${dataKey}`;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      {/* Header row */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Profit/Loss · {label}</p>
          <p className="text-2xl font-bold" style={{ color: mainColor }}>
            {isPositive ? "+" : ""}{formatAmount(total)}{" "}
            <span className="text-sm font-normal text-muted-foreground">{unit}</span>
          </p>
          {volume !== undefined && volume > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Volume : {formatAmount(volume)} {unit}
            </p>
          )}
        </div>

        {/* Range buttons */}
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
            <Tooltip content={<CustomTooltip unit={unit} />} />
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

// ── Main export ───────────────────────────────────────────────────────────────

export function ProfilePnlChart({ series, totalUsdc, totalClt, volumeUsdc, volumeClt }: Props) {
  return (
    <div className="space-y-4">
      <ChartCard
        label="USDC"
        unit="USDC"
        total={totalUsdc}
        volume={volumeUsdc}
        series={series}
        dataKey="usdc"
        color="#f97316"
      />
      <ChartCard
        label="ClawdTrust"
        unit="CLT"
        total={totalClt}
        volume={volumeClt}
        series={series}
        dataKey="clt"
        color="#7F77DD"
      />
    </div>
  );
}
