import { ImageResponse } from "next/og";
import { getLaunchpadToken, getLaunchpadTokenByMint } from "@/services/launchpad-service";

export const alt         = "Token on OMdotfun Launchpad";
export const size        = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate  = 300; // cache 5 min — regenerate only when token data changes

type Props = { params: Promise<{ id: string }> };

const SITE_URL = "https://omdot.fun";

const STATUS_LABELS: Record<string, string> = {
  pending:    "Pending",
  active:     "Live",
  graduating: "Graduating",
  graduated:  "Graduated",
  cancelled:  "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  pending:    "#facc15",
  active:     "#10b981",
  graduating: "#3b82f6",
  graduated:  "#8b5cf6",
  cancelled:  "#ef4444",
};

export default async function OgImage({ params }: Props) {
  const { id } = await params;

  const token = id.length > 36
    ? await getLaunchpadTokenByMint(id)
    : await getLaunchpadToken(id);

  // ── Fallback for missing token ────────────────────────────────────────────
  if (!token) {
    return new ImageResponse(
      <div
        style={{
          width: "100%", height: "100%",
          background: "#0a0a0a",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "sans-serif",
        }}
      >
        <span style={{ fontSize: 32, color: "#555" }}>Token not found</span>
      </div>,
      size,
    );
  }

  // ── Resolve absolute logo URL ─────────────────────────────────────────────
  const logoUrl: string | null = token.logo_url?.startsWith("http")
    ? token.logo_url
    : token.logo_url
    ? `${SITE_URL}${token.logo_url}`
    : null;

  const statusLabel = STATUS_LABELS[token.status] ?? token.status;
  const statusColor = STATUS_COLORS[token.status] ?? "#888";

  const description = token.description
    ? token.description.length > 100
      ? token.description.slice(0, 97) + "…"
      : token.description
    : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return new ImageResponse(
    <div
      style={{
        width: "100%", height: "100%",
        background: "#0a0a0a",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "60px 72px",
        fontFamily: "sans-serif",
        position: "relative",
      }}
    >
      {/* ── Body row ───────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flex: 1 }}>

        {/* Left: text */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", flex: 1 }}>

          {/* Name + ticker */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <span style={{ fontSize: 52, fontWeight: 700, color: "#ffffff", lineHeight: 1, letterSpacing: "-1px" }}>
                {token.name}
              </span>
              {token.is_verified && (
                <div
                  style={{
                    display: "flex", alignItems: "center",
                    background: "#f9731622",
                    border: "1.5px solid #f9731655",
                    borderRadius: 40,
                    padding: "6px 16px",
                    marginTop: "4px",
                  }}
                >
                  <span style={{ fontSize: 18, fontWeight: 700, color: "#f97316" }}>✓ Verified</span>
                </div>
              )}
            </div>
            <span style={{ fontSize: 24, color: "#888", fontWeight: 500 }}>
              ${token.ticker}
            </span>
          </div>

          {/* Description */}
          {description && (
            <span style={{ fontSize: 20, color: "#666", lineHeight: 1.5, maxWidth: 640 }}>
              {description}
            </span>
          )}

          {/* Status badge + CTA */}
          <div style={{ display: "flex", alignItems: "center", gap: "14px", marginTop: "8px" }}>
            <div
              style={{
                display: "flex", alignItems: "center",
                background: statusColor + "22",
                border: `1.5px solid ${statusColor}55`,
                borderRadius: 40, padding: "8px 20px",
              }}
            >
              <span style={{ fontSize: 18, fontWeight: 600, color: statusColor }}>
                {statusLabel}
              </span>
            </div>

            <div
              style={{
                display: "flex", alignItems: "center",
                background: "#f97316",
                borderRadius: 40, padding: "8px 28px",
              }}
            >
              <span style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>
                Buy
              </span>
            </div>
          </div>
        </div>

        {/* Right: logo */}
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            width={180}
            height={180}
            style={{
              borderRadius: 24,
              objectFit: "cover",
              flexShrink: 0,
              marginLeft: 48,
              border: "3px solid #222",
            }}
          />
        ) : (
          <div
            style={{
              width: 180, height: 180,
              background: "#1a1a1a",
              borderRadius: 24,
              flexShrink: 0,
              marginLeft: 48,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "3px solid #222",
            }}
          >
            <span style={{ fontSize: 72, color: "#333" }}>?</span>
          </div>
        )}
      </div>

      {/* ── Footer: branding ───────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "40px" }}>
        <div
          style={{
            width: 28, height: 28,
            background: "#f97316",
            borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <span style={{ fontSize: 16, color: "#fff", fontWeight: 700 }}>O</span>
        </div>
        <span style={{ fontSize: 18, color: "#555", fontWeight: 500 }}>omdot.fun</span>
      </div>
    </div>,
    size,
  );
}
