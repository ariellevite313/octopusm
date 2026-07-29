"use client";

import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { PnlPoint } from "@/services/profile-service";

interface Props {
  series: PnlPoint[];
  totalUsdc: number;
  totalClt: number;
}

type Range = "7d" | "30d" | "all";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatAmount(n: number): string {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toFixed(2);
}

// Custom dot: green above zero, red below
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ColoredDot(props: any) {
  const { cx, cy, value } = props;
  if (cx == null || cy == null) return null;
  const color = value >= 0 ? "#22c55e" : "#ef4444";
  return <circle cx={cx} cy={cy} r={3} fill={color} stroke="var(--background)" strokeWidth={1.5} />;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-muted-foreground">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }} className="font-semibold">
          {p.dataKey === "usdc" ? "USDC" : "ClawdTrust"}: {p.value >= 0 ? "+" : ""}{formatAmount(p.value)}
        </p>
      ))}
    </div>
  );
}

export function ProfilePnlChart({ series, totalUsdc, totalClt }: Props) {
  const [range, setRange] = useState<Range>("7d");

  const filtered = useMemo(() => {
    if (range === "all" || series.length === 0) return series;
    const days = range === "7d" ? 7 : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const f = series.filter((p) => p.date >= cutoffStr);
    // If nothing in range, show last point only
    return f.length > 0 ? f : series.slice(-1);
  }, [series, range]);

  const data = filtered.map((p) => ({
    date: formatDate(p.date),
    usdc: Number(p.usdc.toFixed(4)),
    clt:  Number(p.clt.toFixed(4)),
  }));

  const usdcColor = totalUsdc >= 0 ? "#378ADD" : "#ef4444";
  const cltColor  = totalClt  >= 0 ? "#7F77DD" : "#f97316";

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Cumulative P&amp;L</p>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-base font-semibold" style={{ color: usdcColor }}>
              {totalUsdc >= 0 ? "+" : ""}{formatAmount(totalUsdc)}{" "}
              <span className="text-xs font-normal text-muted-foreground">USDC</span>
            </span>
            <span className="text-base font-semibold" style={{ color: cltColor }}>
              {totalClt >= 0 ? "+" : ""}{formatAmount(totalClt)}{" "}
              <span className="text-xs font-normal text-muted-foreground">ClawdTrust</span>
            </span>
          </div>
        </div>
        <div className="flex gap-0.5 rounded-lg bg-muted p-0.5">
          {(["7d", "30d", "all"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                range === r
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r === "all" ? "All" : r}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mb-2 flex flex-wrap gap-4">
        <div className="flex items-center gap-1.5">
          <div className="h-0.5 w-4 rounded" style={{ background: "#378ADD" }} />
          <span className="text-[11px] text-muted-foreground">USDC</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: "#7F77DD" }} />
          <span className="text-[11px] text-muted-foreground">ClawdTrust</span>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          No activity yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="4 4" />
            <Line
              type="monotone"
              dataKey="usdc"
              stroke="#378ADD"
              strokeWidth={2}
              dot={<ColoredDot />}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="clt"
              stroke="#7F77DD"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={<ColoredDot />}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
