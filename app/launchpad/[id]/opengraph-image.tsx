import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getLaunchpadToken, getLaunchpadTokenByMint } from "@/services/launchpad-service";

export const alt         = "Token on OMdotfun Launchpad";
export const size        = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate  = 300; // cache 5 min

type Props = { params: Promise<{ id: string }> };

const SITE_URL = "https://omdot.fun";
const ORANGE   = "#f97316";

async function loadFonts() {
  const dir = path.join(process.cwd(), "assets", "fonts");
  try {
    const [r, sb, eb] = await Promise.all(
      ["Inter-Regular.otf", "Inter-SemiBold.otf", "Inter-ExtraBold.otf"].map((f) => readFile(path.join(dir, f))),
    );
    return [
      { name: "Inter", data: r,  weight: 400 as const, style: "normal" as const },
      { name: "Inter", data: sb, weight: 600 as const, style: "normal" as const },
      { name: "Inter", data: eb, weight: 800 as const, style: "normal" as const },
    ];
  } catch { return undefined; }
}

async function brandLogo(): Promise<string | null> {
  try {
    const buf = await readFile(path.join(process.cwd(), "public", "omdot-icon.png"));
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch { return null; }
}

function fmtMcap(n: number | null | undefined): string {
  if (n == null || !isFinite(n) || n <= 0) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1).replace(/\.0$/, "")}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "")}K`;
  return `$${Math.round(n)}`;
}

async function loadPoints(t: { chain?: string | null; pool_address?: string | null; mint_address?: string | null; arc_launch_id?: string | null }): Promise<number[]> {
  try {
    const q = new URLSearchParams({ chain: t.chain === "arc" ? "arc" : "solana" });
    if (t.pool_address)  q.set("pool", t.pool_address);
    if (t.mint_address)  q.set("mint", t.mint_address);
    if (t.arc_launch_id) q.set("curve", t.arc_launch_id);
    const r = await fetch(`${SITE_URL}/api/launchpad/sparkline?${q}`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return [];
    const j = (await r.json()) as { points?: number[] };
    return (j.points ?? []).filter((n) => Number.isFinite(n) && n > 0);
  } catch { return []; }
}

/** Scattered small brand marks for the dark background. */
const MARKS: { x: number; y: number; s: number; r: number; o: number }[] = [
  { x: 40,   y: 120, s: 46, r: -14, o: 0.07 }, { x: 330,  y: 20,  s: 34, r: 12,  o: 0.06 },
  { x: 560,  y: 70,  s: 56, r: 20,  o: 0.06 }, { x: 860,  y: 18,  s: 40, r: -10, o: 0.07 },
  { x: 1080, y: 90,  s: 52, r: 16,  o: 0.06 }, { x: 660,  y: 250, s: 38, r: 18,  o: 0.05 },
  { x: 560,  y: 440, s: 44, r: -18, o: 0.05 }, { x: 760,  y: 380, s: 36, r: 8,   o: 0.06 },
  { x: 1120, y: 360, s: 48, r: -12, o: 0.06 }, { x: 60,   y: 520, s: 52, r: 10,  o: 0.06 },
  { x: 340,  y: 540, s: 40, r: -20, o: 0.06 }, { x: 640,  y: 560, s: 58, r: 14,  o: 0.05 },
  { x: 930,  y: 540, s: 38, r: -8,  o: 0.07 }, { x: 1110, y: 540, s: 44, r: 22,  o: 0.06 },
];

export default async function OgImage({ params }: Props) {
  const { id } = await params;

  const token = id.length > 36
    ? await getLaunchpadTokenByMint(id)
    : await getLaunchpadToken(id);

  const [brand, fonts] = await Promise.all([brandLogo(), loadFonts()]);

  if (!token) {
    return new ImageResponse(
      <div style={{ width: "100%", height: "100%", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
        <span style={{ fontSize: 32, color: "#555" }}>Token not found</span>
      </div>,
      size,
    );
  }

  const logoUrl: string | null = token.logo_url?.startsWith("http")
    ? token.logo_url
    : token.logo_url ? `${SITE_URL}${token.logo_url}` : null;

  const points = await loadPoints(token);
  const first  = points[0], last = points[points.length - 1];
  const change = points.length > 1 && first > 0 ? ((last - first) / first) * 100 : null;
  const up     = change === null || change >= 0;

  // Sparkline path
  const W = 480, H = 90;
  let line = "";
  let area = "";
  if (points.length > 1) {
    const min = Math.min(...points), max = Math.max(...points);
    const span = max - min || 1;
    const pts = points.map((p, i) => [
      (i / (points.length - 1)) * W,
      H - 8 - ((p - min) / span) * (H - 16),
    ]);
    line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    area = `${line} L${W} ${H} L0 ${H} Z`;
  } else {
    line = `M0 ${H / 2} L${W} ${H / 2}`;
  }

  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  const asOf = `${now.toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}, ${String(now.getUTCHours()).padStart(2, "0")}:00 UTC`;

  const ticker = token.ticker.toUpperCase();
  const tickerSize = ticker.length > 9 ? 72 : ticker.length > 6 ? 88 : 104;

  return new ImageResponse(
    <div
      style={{
        width: "100%", height: "100%", display: "flex", position: "relative",
        background: "linear-gradient(135deg, #0d0d10 0%, #141012 55%, #1a0f08 100%)",
        fontFamily: "Inter, sans-serif", color: "#fff", overflow: "hidden",
      }}
    >
      {/* Orange glow */}
      <div style={{ position: "absolute", left: -120, top: -160, width: 640, height: 640, borderRadius: 640, background: "radial-gradient(circle, rgba(249,115,22,0.22) 0%, rgba(249,115,22,0) 70%)", display: "flex" }} />
      <div style={{ position: "absolute", right: -100, bottom: -180, width: 620, height: 620, borderRadius: 620, background: "radial-gradient(circle, rgba(249,115,22,0.16) 0%, rgba(249,115,22,0) 70%)", display: "flex" }} />

      {/* Background brand marks */}
      {brand && MARKS.map((m, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={brand} alt="" width={m.s} height={m.s}
          style={{ position: "absolute", left: m.x, top: m.y, width: m.s, height: m.s, opacity: m.o, transform: `rotate(${m.r}deg)` }} />
      ))}

      {/* Left column */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "44px 0 44px 72px", position: "relative" }}>
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {brand ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand} alt="" width={44} height={44} style={{ width: 44, height: 44, borderRadius: 12 }} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: 12, background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800 }}>O</div>
          )}
          <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.5px" }}>OMdotfun</span>
        </div>

        {/* Ticker + name */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 28 }}>
          <span style={{ fontSize: tickerSize, fontWeight: 800, letterSpacing: "-2px", lineHeight: 1 }}>{ticker}</span>
          <span style={{ fontSize: 34, color: "#e5e5e5", marginTop: 10, fontWeight: 400 }}>
            {token.name.length > 28 ? token.name.slice(0, 27) + "…" : token.name}
          </span>
        </div>

        {/* Market cap + change */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 18, marginTop: 24 }}>
          <span style={{ fontSize: 30, color: "#a3a3a3", fontWeight: 600 }}>MC</span>
          <span style={{ fontSize: 68, fontWeight: 800, letterSpacing: "-2px", lineHeight: 1 }}>{fmtMcap(token.market_cap_usd)}</span>
          {change !== null && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, color: up ? "#22c55e" : "#ef4444" }}>
              <span style={{ fontSize: 28 }}>{up ? "▲" : "▼"}</span>
              <span style={{ fontSize: 34, fontWeight: 800 }}>{up ? "+" : ""}{change.toFixed(1)}%</span>
              <span style={{ fontSize: 28, fontWeight: 600 }}>24h</span>
            </div>
          )}
        </div>

        {/* Sparkline */}
        <div style={{ display: "flex", marginTop: 10 }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            {area && <path d={area} fill={ORANGE} fillOpacity={0.14} />}
            <path d={line} fill="none" stroke={ORANGE} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        </div>

        {/* Buy pill */}
        <div style={{ display: "flex", marginTop: "auto", paddingTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18, background: ORANGE, borderRadius: 60, padding: "10px 12px 10px 34px" }}>
            <span style={{ fontSize: 30, fontWeight: 800, color: "#ffffff", letterSpacing: "1px" }}>BUY</span>
            <div style={{ width: 46, height: 46, borderRadius: 46, background: "rgba(255,255,255,0.22)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="24" height="24" viewBox="0 0 24 24">
                <path d="M7 17 17 7M8 7h9v9" fill="none" stroke="#ffffff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Right column: logo */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", width: 440, padding: "96px 60px 40px 0", position: "relative" }}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" width={330} height={330}
            style={{ width: 330, height: 330, borderRadius: 48, objectFit: "cover", border: "4px solid rgba(255,255,255,0.12)", background: "#1a1a1a" }} />
        ) : (
          <div style={{ width: 330, height: 330, borderRadius: 48, background: "#1a1a1a", border: "4px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 140, fontWeight: 800, color: ORANGE }}>
            {ticker.slice(0, 1)}
          </div>
        )}
        <span style={{ fontSize: 22, color: "#d4d4d4", fontWeight: 600, alignSelf: "flex-end" }}>as of {asOf}</span>
      </div>
    </div>,
    fonts ? { ...size, fonts } : size,
  );
}
