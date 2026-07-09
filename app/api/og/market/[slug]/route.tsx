import { ImageResponse } from "next/og";
import { getMarketBySlug } from "@/services/prediction-service";
import { parseMarketOptions } from "@/lib/market/utils";

export const runtime = "edge";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const market = await getMarketBySlug(slug);

  const title   = market?.title ?? "Octo Market";
  const options = market ? parseMarketOptions(market.options) : [];

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          backgroundColor: "#0c0a09",
          padding: "48px 56px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "32px" }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              backgroundColor: "#f97316",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              color: "#fff",
            }}
          >
            🐙
          </div>
          <span style={{ fontSize: 18, color: "#f97316", fontWeight: 600 }}>Octo Market</span>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 38,
            fontWeight: 700,
            color: "#fafaf9",
            lineHeight: 1.25,
            flex: 1,
            maxWidth: 900,
          }}
        >
          {title}
        </div>

        {/* Options row */}
        {options.length > 0 && (
          <div style={{ display: "flex", gap: 16, marginTop: 32 }}>
            {options.slice(0, 4).map((opt) => {
              const totalInv = options.reduce((s, o) => s + 1 / o.oddsMultiplier, 0);
              const prob     = Math.round((1 / opt.oddsMultiplier / totalInv) * 100);
              return (
                <div
                  key={opt.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    backgroundColor: "#1c1917",
                    border: "1px solid #292524",
                    borderRadius: 14,
                    padding: "14px 20px",
                    minWidth: 150,
                  }}
                >
                  <span style={{ fontSize: 13, color: "#a8a29e" }}>{opt.label}</span>
                  <span style={{ fontSize: 24, fontWeight: 700, color: "#fb923c" }}>{prob}%</span>
                  <span style={{ fontSize: 13, color: "#78716c" }}>×{opt.oddsMultiplier}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
          <span style={{ fontSize: 14, color: "#57534e" }}>octomarket.io</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
