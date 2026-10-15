/**
 * GET /api/og/gains/[wallet]?p=30d
 * Image PNG (1200×630) de la carte « Creator gains » : aperçu des liens partagés,
 * bouton « Copy image » et partage natif.
 */
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCreatorGains, gainsSeries, fmtGain, GAINS_PERIODS, type GainsPeriod } from "@/lib/creator-gains";

const ORANGE = "#ff7a1a";

// Police Inter (OFL) chargée une fois — sinon le gras n'est pas rendu
let fontsP: Promise<{ name: string; data: Buffer; weight: 400 | 600 | 700; style: "normal" }[]> | null = null;
function fonts() {
  fontsP ??= Promise.all(([["Regular", 400], ["SemiBold", 600], ["Bold", 700]] as const).map(async ([f, weight]) => ({
    name: "Inter", weight, style: "normal" as const,
    data: await readFile(path.join(process.cwd(), "assets/fonts", `Inter-${f}.otf`)),
  })));
  return fontsP;
}

function fmtDate(ms: number, span: number) {
  const d = new Date(ms);
  return span <= 2 * 24 * 3600_000
    ? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", timeZone: "UTC" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export async function GET(req: Request, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params;
  const url = new URL(req.url);
  const origin = url.origin;
  const p = (url.searchParams.get("p") ?? "30d") as GainsPeriod;
  const period: GainsPeriod = p in GAINS_PERIODS ? p : "30d";

  const g = await getCreatorGains(decodeURIComponent(wallet)).catch(() => null);
  const name = g?.name ?? "Creator";
  const currency = g?.currency ?? "SOL";
  const total = g?.total ?? 0;
  const { series, start, end, gain } = gainsSeries(g?.history ?? [], period);
  const avatar = g?.avatarSrc ? (g.avatarSrc.startsWith("http") ? g.avatarSrc : origin + g.avatarSrc) : null;

  // Courbe
  const W = 520, H = 280;
  const vals = series.map(s => s.v);
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const x = (t: number) => ((t - start) / Math.max(end - start, 1)) * W;
  const y = (v: number) => (max === min ? H * 0.55 : 10 + (1 - (v - min) / span) * (H - 20));
  const line = series.map((s, i) => `${i ? "L" : "M"}${x(s.t).toFixed(1)} ${y(s.v).toFixed(1)}`).join(" ");
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const last = series[series.length - 1];
  const label = period === "all" ? "all time" : period;

  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#ffffff", fontFamily: "Inter", color: "#0b0b11" }}>
        <div style={{ display: "flex", flex: 1, alignItems: "center", padding: "0 56px", position: "relative" }}>
          <div style={{ position: "absolute", top: -160, right: -120, width: 520, height: 520, borderRadius: 520, background: "rgba(255,122,26,0.10)", display: "flex" }} />
          {/* Gauche : identité + total */}
          <div style={{ display: "flex", flexDirection: "column", width: 470 }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" width={84} height={84} style={{ borderRadius: 24, objectFit: "cover", border: `3px solid ${ORANGE}` }} />
              ) : (
                <div style={{ display: "flex", width: 84, height: 84, borderRadius: 24, background: ORANGE, color: "#fff", fontSize: 34, fontWeight: 700, alignItems: "center", justifyContent: "center" }}>
                  {name.replace(/^@/, "").slice(0, 2).toUpperCase()}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", marginLeft: 22 }}>
                <div style={{ display: "flex", fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>{name.length > 18 ? name.slice(0, 17) + "…" : name}</div>
                <div style={{ display: "flex", marginTop: 8, padding: "4px 12px", borderRadius: 10, background: "rgba(255,122,26,0.14)", color: "#e8650c", fontSize: 22, fontWeight: 600, alignSelf: "flex-start" }}>Creator fees</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", marginTop: 44 }}>
              <div style={{ display: "flex", fontSize: 96, fontWeight: 700, letterSpacing: -4, lineHeight: 1 }}>{fmtGain(total)}</div>
              <div style={{ display: "flex", fontSize: 38, fontWeight: 600, color: "rgba(0,0,0,0.45)", marginLeft: 14, marginBottom: 10 }}>{currency}</div>
            </div>
            <div style={{ display: "flex", marginTop: 18, fontSize: 30 }}>
              <span style={{ color: "#22c55e", fontWeight: 600 }}>+{fmtGain(gain)} {currency}</span>
              <span style={{ color: "rgba(0,0,0,0.45)", marginLeft: 12 }}>{label}</span>
            </div>
          </div>
          {/* Droite : courbe */}
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 30 }}>
            <svg width={W + 12} height={H + 12} viewBox={`-6 -6 ${W + 12} ${H + 12}`}>
              <defs>
                <linearGradient id="a" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ORANGE} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={ORANGE} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={area} fill="url(#a)" />
              <path d={line} fill="none" stroke={ORANGE} strokeWidth={4} strokeLinejoin="round" />
              <circle cx={x(last.t)} cy={y(last.v)} r={8} fill={ORANGE} />
            </svg>
            <div style={{ display: "flex", justifyContent: "space-between", width: W, marginTop: 12, fontSize: 20, color: "rgba(0,0,0,0.4)" }}>
              <span>{fmtDate(start, end - start)}</span>
              <span>{fmtDate(start + (end - start) / 2, end - start)}</span>
              <span>{fmtDate(end, end - start)}</span>
            </div>
          </div>
        </div>
        {/* Bandeau */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 128, padding: "0 56px", background: `linear-gradient(90deg, ${ORANGE}, #ff8a2e, #ff5a00)`, color: "#fff" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${origin}/card-logo.png`} alt="" width={68} height={68} style={{ borderRadius: 68 }} />
            <div style={{ display: "flex", fontSize: 48, fontWeight: 800, marginLeft: 18, letterSpacing: -1 }}>omdot.fun</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex", fontSize: 22, color: "rgba(255,255,255,0.85)" }}>{g?.refCode ? "Join with code" : "Launch your token"}</div>
            <div style={{ display: "flex", fontSize: 34, fontWeight: 700 }}>{g?.refCode ?? "in seconds"}</div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: await fonts().catch(() => undefined), headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } },
  );
}
