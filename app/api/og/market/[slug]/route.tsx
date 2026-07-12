import { ImageResponse } from "next/og";
import { getMarketBySlug } from "@/services/prediction-service";
import { parseMarketOptions } from "@/lib/market/utils";

export const runtime = "edge";

function optionChipColor(label: string, index: number): { bg: string; text: string } {
  const l = label.trim().toLowerCase();
  if (l === "yes") return { bg: "#166534", text: "#bbf7d0" };
  if (l === "no")  return { bg: "#7f1d1d", text: "#fecaca" };
  const palette = [
    { bg: "#1e3a5f", text: "#93c5fd" },
    { bg: "#3b1f6b", text: "#c4b5fd" },
    { bg: "#3b2a0a", text: "#fcd34d" },
    { bg: "#0f3d2e", text: "#6ee7b7" },
  ];
  return palette[index % palette.length];
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const market = await getMarketBySlug(slug);

  const title   = market?.title ?? "Octo Market";
  const options = market ? parseMarketOptions(market.options) : [];

  const isResolved = market?.is_resolved ?? false;
  const isActive   = market?.is_active ?? true;
  const statusLabel = isResolved ? "Resolved" : isActive ? "Live" : "Closed";
  const statusBg    = isResolved ? "#1c1917"  : isActive ? "#14532d" : "#1c1917";
  const statusText  = isResolved ? "#a8a29e"  : isActive ? "#4ade80" : "#78716c";

  const totalInv = options.reduce((s, o) => s + 1 / o.oddsMultiplier, 0);

  const dateLabel = market?.event_start_at
    ? new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" }).format(new Date(market.event_start_at))
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          backgroundColor: "#0f1117",
          padding: "52px 60px",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Subtle top accent line */}
        <div style={{
          position: "absolute",
          top: 0, left: 0, right: 0,
          height: 4,
          backgroundColor: "#f97316",
          display: "flex",
        }} />

        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "40px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              backgroundColor: "#f97316",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20,
            }}>
              🐙
            </div>
            <span style={{ fontSize: 16, color: "#f97316", fontWeight: 600, letterSpacing: "0.05em" }}>
              OCTO MARKET
            </span>
          </div>

          {/* Status badge */}
          <div style={{
            display: "flex", alignItems: "center", gap: 7,
            backgroundColor: statusBg,
            border: `1px solid ${statusText}33`,
            borderRadius: 20,
            padding: "6px 16px",
          }}>
            {!isResolved && isActive && (
              <div style={{
                width: 7, height: 7, borderRadius: "50%",
                backgroundColor: "#4ade80",
                display: "flex",
              }} />
            )}
            <span style={{ fontSize: 13, fontWeight: 600, color: statusText }}>
              {statusLabel}
            </span>
          </div>
        </div>

        {/* Title */}
        <div style={{
          fontSize: options.length <= 2 ? 44 : 38,
          fontWeight: 700,
          color: "#f1f5f9",
          lineHeight: 1.28,
          flex: 1,
          maxWidth: 960,
        }}>
          {title}
        </div>

        {/* Date label if present */}
        {dateLabel && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, marginBottom: 4 }}>
            <span style={{ fontSize: 14, color: "#64748b" }}>{dateLabel}</span>
          </div>
        )}

        {/* Options chips */}
        {options.length > 0 && (
          <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "nowrap" }}>
            {options.slice(0, 4).map((opt, i) => {
              const prob  = totalInv > 0 ? Math.round((1 / opt.oddsMultiplier / totalInv) * 100) : 0;
              const color = optionChipColor(opt.label, i);
              return (
                <div
                  key={opt.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    backgroundColor: color.bg,
                    borderRadius: 24,
                    padding: "10px 22px",
                  }}
                >
                  <span style={{ fontSize: 16, fontWeight: 500, color: color.text }}>{opt.label}</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: color.text }}>{prob}%</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginTop: 32, paddingTop: 20,
          borderTop: "1px solid #1e293b",
        }}>
          <span style={{ fontSize: 14, color: "#334155" }}>octomarket.app</span>
          <span style={{ fontSize: 14, color: "#57534e" }}>octomarket.app</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
