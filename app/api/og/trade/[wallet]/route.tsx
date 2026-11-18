/**
 * GET /api/og/trade/[wallet]?mint=…
 * Carte de partage d'un trade (1080×1240) : cadre en verre incolore, OMDOTFUN, courbe avec les achats (B) et ventes (S),
 * gain réalisé + latent et pourcentage. N'importe qui peut partager la carte de n'importe quel wallet (activité publique).
 */
import { limited } from "@/lib/limit";
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ogFonts } from "@/lib/og/brand";
import { getTradeCard, type CardTrade } from "@/lib/trade-card";

const W = 1080, H = 1240;
const UP = "#3ddc84", DOWN = "#ff5d4d";

async function local(file: string) {
  try { return `data:image/png;base64,${(await readFile(path.join(process.cwd(), "public", file))).toString("base64")}`; } catch { return null; }
}
/** Image distante en data URI (une image injoignable ne casse pas la carte). */
async function remote(url: string | null, origin: string) {
  if (!url) return null;
  try {
    const r = await fetch(url.startsWith("http") ? url : origin + url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const type = r.headers.get("content-type") ?? "image/png";
    if (!/^image\/(png|jpe?g|gif|webp)/.test(type)) return null;
    return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  } catch { return null; }
}
const money = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1e9 ? `${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(2)}M` : a >= 1e4 ? `${(a / 1e3).toFixed(1)}K`
    : a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `$${s}`;
};
const axis = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : n >= 1 ? `$${n.toFixed(2)}` : `$${n.toPrecision(2)}`);
const day = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export async function GET(req: Request, { params }: { params: Promise<{ wallet: string }> }) {
  { const lim = await limited(req, "og-trade", 30); if (lim) return lim; }
  const { wallet } = await params;
  const url = new URL(req.url);
  const mint = (url.searchParams.get("mint") ?? "").trim();
  const card = mint ? await getTradeCard(decodeURIComponent(wallet), mint).catch(() => null) : null;
  const [logo, avatar, tokenLogo, chainLogo] = await Promise.all([
    local("omdot-icon.png"), remote(card?.avatar ?? null, url.origin), remote(card?.logo ?? null, url.origin), local(`chains/${card?.chain ?? "solana"}.png`),
  ]);
  const fonts = await ogFonts();

  // Courbe
  const CW = 640, CH = 400;
  const series = card?.series.length ? card.series : [{ t: Date.now() - 1, v: 1 }, { t: Date.now(), v: 1 }];
  const t0 = Math.min(series[0].t, card?.trades[0]?.tsMs ?? series[0].t), t1 = Math.max(series[series.length - 1].t, Date.now());
  const vs = series.map((p) => p.v); const lo = Math.min(...vs, 0) , hi = Math.max(...vs) * 1.08 || 1;
  const x = (t: number) => ((t - t0) / Math.max(t1 - t0, 1)) * CW;
  const y = (v: number) => CH - ((v - lo) / Math.max(hi - lo, 1e-12)) * CH;
  const valueAt = (t: number) => { let best = series[0]; for (const p of series) { if (p.t <= t) best = p; else break; } return best.v; };
  const line = series.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  const last = series[series.length - 1];
  const good = (card?.pnl ?? 0) >= 0;
  const tone = good ? UP : DOWN;

  // Marqueurs B / S (on fusionne ceux qui se chevauchent)
  const marks: { x: number; y: number; side: CardTrade["side"] }[] = [];
  for (const t of card?.trades ?? []) {
    const m = { x: x(t.tsMs), y: y(valueAt(t.tsMs)), side: t.side };
    const prev = marks[marks.length - 1];
    if (prev && prev.side === m.side && Math.abs(prev.x - m.x) < 14 && Math.abs(prev.y - m.y) < 14) continue;
    marks.push(m);
  }
  const shown = marks.slice(-60);
  const ticks = [0, 0.5, 1].map((f) => t0 + (t1 - t0) * f);

  const glass = "linear-gradient(150deg, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0.10) 22%, rgba(255,255,255,0.03) 48%, rgba(255,255,255,0.09) 72%, rgba(255,255,255,0.26) 100%)";

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: W, height: H, fontFamily: "Inter", color: "#fff", background: "radial-gradient(circle at 18% 8%, #2a2a33 0%, #0b0b0f 45%, #050506 100%)", padding: 44 }}>
        {/* Cadre en verre incolore */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, borderRadius: 64, background: glass, border: "2px solid rgba(255,255,255,0.42)", boxShadow: "inset 0 2px 0 rgba(255,255,255,0.55), inset 0 -2px 0 rgba(255,255,255,0.12), 0 30px 80px rgba(0,0,0,0.6)", padding: 22 }}>
          {/* Panneau */}
          <div style={{ display: "flex", flexDirection: "column", flex: 1, borderRadius: 46, background: "#07070a", border: "1px solid rgba(255,255,255,0.10)", padding: "40px 42px 32px" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              {avatar
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={avatar} alt="" width={124} height={124} style={{ borderRadius: 124, objectFit: "cover", border: "2px solid rgba(255,255,255,0.25)" }} />
                : <div style={{ display: "flex", width: 124, height: 124, borderRadius: 124, background: "rgba(255,255,255,0.10)", alignItems: "center", justifyContent: "center", fontSize: 44, fontWeight: 800 }}>{(card?.name ?? "OM").replace(/^@/, "").slice(0, 2).toUpperCase()}</div>}
              <div style={{ display: "flex", flexDirection: "column", marginLeft: 30, flex: 1 }}>
                <div style={{ display: "flex", fontSize: 48, fontWeight: 600, letterSpacing: -1 }}>{(card?.name ?? "Trader").slice(0, 20)}</div>
                <div style={{ display: "flex", marginTop: 12, alignSelf: "flex-start", padding: "6px 16px", borderRadius: 12, background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)", fontSize: 26, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>{card?.open ? "Open" : "Closed"}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <div style={{ display: "flex", fontSize: 26, color: "rgba(255,255,255,0.45)" }}>{day(card?.lastAt ?? Date.now())}, {new Date(card?.lastAt ?? Date.now()).getUTCFullYear()}</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {chainLogo && <img src={chainLogo} alt="" width={40} height={40} style={{ marginTop: 18, borderRadius: 40, opacity: 0.8 }} />}
              </div>
            </div>

            {/* Courbe + marqueurs */}
            <div style={{ display: "flex", position: "relative", width: CW + 200, height: CH + 70, marginTop: 34 }}>
              <svg width={CW} height={CH} viewBox={`0 0 ${CW} ${CH}`} style={{ position: "absolute", left: 0, top: 10 }}>
                <path d={`M0 ${y(last.v).toFixed(1)} H${CW}`} stroke="rgba(255,255,255,0.35)" strokeWidth={2} strokeDasharray="10 10" />
                <path d={line} fill="none" stroke={tone} strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" />
              </svg>
              {shown.map((m, i) => (
                <div key={i} style={{ display: "flex", position: "absolute", left: m.x - 22, top: 10 + m.y - 22, width: 44, height: 44, borderRadius: 44, alignItems: "center", justifyContent: "center", background: m.side === "buy" ? UP : DOWN, border: "3px solid #07070a", fontSize: 20, fontWeight: 800, color: "#07070a" }}>{m.side === "buy" ? "B" : "S"}</div>
              ))}
              {avatar && card?.trades[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" width={56} height={56} style={{ position: "absolute", left: x(card.trades[0].tsMs) - 28, top: 10 + y(valueAt(card.trades[0].tsMs)) + 14, borderRadius: 56, border: "3px solid #07070a", objectFit: "cover" }} />
              )}
              {/* Valeur actuelle et axe */}
              <div style={{ display: "flex", position: "absolute", left: CW + 14, top: 10 + y(last.v) - 26, padding: "6px 14px", borderRadius: 12, background: tone, color: "#07070a", fontSize: 28, fontWeight: 800 }}>{axis(last.v)}</div>
              <div style={{ display: "flex", position: "absolute", left: CW + 30, top: 10 + CH - 24, fontSize: 26, color: "rgba(255,255,255,0.3)" }}>{axis(lo)}</div>
              <div style={{ display: "flex", position: "absolute", left: 0, top: CH + 32, width: CW, justifyContent: "space-between", fontSize: 26, color: "rgba(255,255,255,0.4)" }}>
                {ticks.map((t, i) => <span key={i}>{day(t)}</span>)}
              </div>
            </div>

            {/* Token et gain */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "auto", borderRadius: 36, border: "1.5px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)", padding: "30px 24px 34px" }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                {tokenLogo
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={tokenLogo} alt="" width={62} height={62} style={{ borderRadius: 62, objectFit: "cover" }} />
                  : <div style={{ display: "flex", width: 62, height: 62, borderRadius: 62, background: "rgba(255,255,255,0.12)" }} />}
                <div style={{ display: "flex", marginLeft: 18, fontSize: 44, fontWeight: 600 }}>{card?.symbol ?? "TOKEN"}</div>
                {card?.verified && <div style={{ display: "flex", marginLeft: 14, width: 34, height: 34, borderRadius: 34, background: "rgba(255,255,255,0.9)", color: "#07070a", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800 }}>✓</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", marginTop: 20 }}>
                <div style={{ display: "flex", fontSize: 76, fontWeight: 600, letterSpacing: -2, color: tone }}>{card ? `${good ? "+" : "-"}${money(card.pnl)}` : "$0.00"}</div>
                <div style={{ display: "flex", marginLeft: 22, fontSize: 36, color: "rgba(255,255,255,0.85)" }}>({good ? "▲" : "▼"} {Math.abs(card?.pct ?? 0).toFixed(2)}%)</div>
              </div>
            </div>
          </div>

          {/* Bas du cadre : OMDOTFUN */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 30px 0px" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {logo && <img src={logo} alt="" width={76} height={76} style={{ objectFit: "contain" }} />}
              <div style={{ display: "flex", marginLeft: 18, fontSize: 60, fontWeight: 800, letterSpacing: -1 }}>OMDOTFUN</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <div style={{ display: "flex", fontSize: 26, color: "rgba(255,255,255,0.6)" }}>Start trading at</div>
              <div style={{ display: "flex", fontSize: 36, fontWeight: 800 }}>omdot.fun</div>
            </div>
          </div>
        </div>
      </div>
    ),
    { width: W, height: H, fonts, headers: { "Cache-Control": "public, max-age=120, s-maxage=120" } },
  );
}
