/**
 * Carte de partage OMDOTFUN (1080×1240) : cadre en verre incolore, en-tête (avatar, nom, badge, date), courbe avec
 * marqueurs d'achats (B) et de ventes (S), encadré du gain, pied OMDOTFUN. Utilisée par :
 *  - /api/og/trade/[wallet]   : un trade sur un token (Terminal)
 *  - /api/og/profile/[wallet] : les gains d'un profil
 * Avec `wide`, la même carte est posée au centre d'une image 1200×630 (aperçu des liens sur X, Telegram, etc.).
 */
import React from "react";
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ogFonts } from "@/lib/og/brand";

export const CARD_W = 1080, CARD_H = 1240;
export const WIDE_W = 1200, WIDE_H = 630;
const UP = "#3ddc84", DOWN = "#ff5d4d";

export async function localImage(file: string) {
  try { return `data:image/png;base64,${(await readFile(path.join(process.cwd(), "public", file))).toString("base64")}`; } catch { return null; }
}

/** Image distante en data URI (une image injoignable ne casse pas la carte). */
export async function remoteImage(url: string | null, origin: string) {
  if (!url) return null;
  try {
    const r = await fetch(url.startsWith("http") ? url : origin + url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const type = r.headers.get("content-type") ?? "image/png";
    if (!/^image\/(png|jpe?g|gif|webp)/.test(type)) return null;
    return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  } catch { return null; }
}

export const money = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1e9 ? `${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(2)}M` : a >= 1e4 ? `${(a / 1e3).toFixed(1)}K`
    : a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `$${s}`;
};
const axisLabel = (n: number) => {
  const a = Math.abs(n), sign = n < 0 ? "-" : "";
  const s = a >= 1e9 ? `${(a / 1e9).toFixed(1)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(1)}K` : a >= 1 || a === 0 ? a.toFixed(2) : a.toPrecision(2);
  return `${sign}$${s}`;
};
const day = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
/** Heure (période courte) ou date (période longue), comme l'axe du temps des plateformes d'échange */
const tick = (ms: number, span: number) => span <= 2 * 86_400_000 ? `${String(new Date(ms).getUTCHours()).padStart(2, "0")}:00` : day(ms);

export type PnlCardProps = {
  name: string;
  avatar: string | null;           // data URI
  badge: string;                   // « Open », « Closed », « 12 tokens »…
  dateMs: number;
  chainLogos: (string | null)[];   // data URIs
  series: { t: number; v: number }[];
  /** Vraies bougies (capitalisation) : si fournies, elles remplacent la courbe et l'échelle s'ajuste aux prix */
  candles?: { t: number; o: number; h: number; l: number; c: number }[];
  /** Marqueurs sur la courbe : vert (achat, gain) ou rouge (vente, perte), lettre B / S par défaut. */
  marks: { t: number; side: "buy" | "sell"; label?: string; usd?: number }[];
  /** Encadré du bas : logo (facultatif), titre, gain et pourcentage, détails (facultatifs). */
  box: { logo?: string | null; title: string; verified?: boolean; amount: number; pct: number | null; details?: { label: string; value: string }[] };
};

export async function pnlCardResponse(p: PnlCardProps, opts: { wide?: boolean; cache?: string } = {}) {
  const [logo, fonts] = await Promise.all([localImage("omdot-icon.png"), ogFonts()]);
  const card = <PnlCard {...p} logo={logo} />;
  const headers = { "Cache-Control": opts.cache ?? "public, max-age=120, s-maxage=120" };
  if (!opts.wide) return new ImageResponse(card, { width: CARD_W, height: CARD_H, fonts, headers });
  // Aperçu de lien : la carte (rendue en PNG) réduite au centre d'un fond sombre, sinon X la recadre et coupe le haut et le bas
  const png = Buffer.from(await new ImageResponse(card, { width: CARD_W, height: CARD_H, fonts }).arrayBuffer()).toString("base64");
  const h = WIDE_H - 30, w = Math.round((h * CARD_W) / CARD_H);
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: WIDE_W, height: WIDE_H, alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at 20% 10%, #2a2a33 0%, #0b0b0f 50%, #050506 100%)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`data:image/png;base64,${png}`} alt="" width={w} height={h} />
      </div>
    ),
    { width: WIDE_W, height: WIDE_H, fonts, headers },
  );
}

function PnlCard({ name, avatar, badge, dateMs, chainLogos, series: rawSeries, candles: rawCandles, marks: rawMarks, box, logo }: PnlCardProps & { logo: string | null }) {
  const CW = 640, CH = 400;
  const series = rawSeries.length >= 2 ? rawSeries : [{ t: Date.now() - 86_400_000, v: rawSeries[0]?.v ?? 0 }, { t: Date.now(), v: rawSeries[0]?.v ?? 0 }];
  const candles = rawCandles && rawCandles.length >= 6 ? rawCandles : null;
  const t0 = Math.min(series[0].t, rawMarks[0]?.t ?? series[0].t), t1 = candles ? series[series.length - 1].t + (candles[1].t - candles[0].t) : Math.max(series[series.length - 1].t, Date.now());
  const vs = candles ? candles.flatMap((c) => [c.h, c.l]) : series.map((q) => q.v);
  const vmin = candles ? Math.min(...vs) : Math.min(...vs, 0), vmax = candles ? Math.max(...vs) : Math.max(...vs, 0);
  const pad = (vmax - vmin) * (candles ? 0.12 : 0.08) || 1;
  const lo = candles ? Math.max(0, vmin - pad) : vmin < 0 ? vmin - pad : 0, hi = vmax + pad;
  const x = (t: number) => ((t - t0) / Math.max(t1 - t0, 1)) * CW;
  const y = (v: number) => CH - ((v - lo) / Math.max(hi - lo, 1e-12)) * CH;
  const valueAt = (t: number) => { let best = series[0]; for (const q of series) { if (q.t <= t) best = q; else break; } return best.v; };
  const line = series.map((q, i) => `${i ? "L" : "M"}${x(q.t).toFixed(1)} ${y(q.v).toFixed(1)}`).join(" ");
  const last = series[series.length - 1];
  const good = box.amount >= 0;
  const tone = good ? UP : DOWN;

  // Marqueurs B / S (on fusionne ceux qui se chevauchent)
  const marks: { x: number; y: number; side: "buy" | "sell"; label?: string; usd?: number }[] = [];
  for (const m0 of rawMarks) {
    const m = { x: x(m0.t), y: y(valueAt(m0.t)), side: m0.side, label: m0.label, usd: m0.usd };
    const prev = marks[marks.length - 1];
    if (prev && prev.side === m.side && Math.abs(prev.x - m.x) < 14 && Math.abs(prev.y - m.y) < 14) continue;
    marks.push(m);
  }
  const shown = marks.slice(-60);
  // Montant affiché au-dessus des plus gros trades (3 au plus), comme « $541 » sur les cartes des plateformes
  const big = new Set(shown.map((m, i) => [m.usd ?? 0, i] as const).filter(([u]) => u >= 1).sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, i]) => i));
  const ticks = [0.08, 0.36, 0.64, 0.92].map((f) => t0 + (t1 - t0) * f);
  const grid = [1, 2 / 3, 1 / 3].map((f) => lo + (hi - lo) * f);
  const glass = "linear-gradient(150deg, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0.10) 22%, rgba(255,255,255,0.03) 48%, rgba(255,255,255,0.09) 72%, rgba(255,255,255,0.26) 100%)";
  const logos = chainLogos.filter(Boolean) as string[];

  return (
    <div style={{ display: "flex", width: CARD_W, height: CARD_H, fontFamily: "Inter", color: "#fff", background: "radial-gradient(circle at 18% 8%, #2a2a33 0%, #0b0b0f 45%, #050506 100%)", padding: 44 }}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, borderRadius: 64, background: glass, border: "2px solid rgba(255,255,255,0.42)", boxShadow: "inset 0 2px 0 rgba(255,255,255,0.55), inset 0 -2px 0 rgba(255,255,255,0.12), 0 30px 80px rgba(0,0,0,0.6)", padding: 22 }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, borderRadius: 46, background: "#07070a", border: "1px solid rgba(255,255,255,0.10)", padding: "40px 42px 32px" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {avatar
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={avatar} alt="" width={124} height={124} style={{ borderRadius: 124, objectFit: "cover", border: "2px solid rgba(255,255,255,0.25)" }} />
              : <div style={{ display: "flex", width: 124, height: 124, borderRadius: 124, background: "rgba(255,255,255,0.10)", alignItems: "center", justifyContent: "center", fontSize: 44, fontWeight: 800 }}>{name.replace(/^@/, "").slice(0, 2).toUpperCase()}</div>}
            <div style={{ display: "flex", flexDirection: "column", marginLeft: 30, flex: 1 }}>
              <div style={{ display: "flex", fontSize: 48, fontWeight: 600, letterSpacing: -1 }}>{name.slice(0, 20)}</div>
              <div style={{ display: "flex", marginTop: 12, alignSelf: "flex-start", padding: "6px 16px", borderRadius: 12, background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)", fontSize: 26, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>{badge}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <div style={{ display: "flex", fontSize: 26, color: "rgba(255,255,255,0.45)" }}>{day(dateMs)}, {new Date(dateMs).getUTCFullYear()}</div>
              <div style={{ display: "flex", marginTop: 18 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {logos.slice(0, 3).map((l, i) => <img key={i} src={l} alt="" width={40} height={40} style={{ marginLeft: i ? 8 : 0, borderRadius: 40, opacity: 0.85 }} />)}
              </div>
            </div>
          </div>

          {/* Courbe + marqueurs */}
          <div style={{ display: "flex", position: "relative", width: CW + 200, height: CH + 70, marginTop: 34 }}>
            <svg width={CW} height={CH} viewBox={`0 0 ${CW} ${CH}`} style={{ position: "absolute", left: 0, top: 10 }}>
              {grid.map((g, i) => <path key={i} d={`M0 ${y(g).toFixed(1)} H${CW}`} stroke="rgba(255,255,255,0.07)" strokeWidth={1.5} />)}
              <path d={`M0 ${y(last.v).toFixed(1)} H${CW}`} stroke="rgba(255,255,255,0.35)" strokeWidth={2} strokeDasharray="10 10" />
              {lo < 0 && <path d={`M0 ${y(0).toFixed(1)} H${CW}`} stroke="rgba(255,255,255,0.12)" strokeWidth={2} />}
              {candles ? candles.map((c, i) => {
                const cx = x(c.t) + (CW / candles.length) / 2, w = Math.max(3, (CW / candles.length) * 0.62), up = c.c >= c.o, col = up ? UP : DOWN;
                const top = y(Math.max(c.o, c.c)), bot = y(Math.min(c.o, c.c));
                return (
                  <g key={i}>
                    <path d={`M${cx.toFixed(1)} ${y(c.h).toFixed(1)} V${y(c.l).toFixed(1)}`} stroke={col} strokeWidth={2} />
                    <rect x={(cx - w / 2).toFixed(1)} y={top.toFixed(1)} width={w.toFixed(1)} height={Math.max(2, bot - top).toFixed(1)} fill={col} />
                  </g>
                );
              }) : <path d={line} fill="none" stroke={tone} strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" />}
            </svg>
            {shown.map((m, i) => (
              <div key={i} style={{ display: "flex", position: "absolute", left: m.x - 22, top: 10 + m.y - 22, width: 44, height: 44, borderRadius: 44, alignItems: "center", justifyContent: "center", background: m.side === "buy" ? UP : DOWN, border: "3px solid #07070a", fontSize: 20, fontWeight: 800, color: "#07070a" }}>{m.label ?? (m.side === "buy" ? "B" : "S")}</div>
            ))}
            {shown.map((m, i) => big.has(i) && m.usd ? (
              <div key={`u${i}`} style={{ display: "flex", position: "absolute", left: Math.min(CW - 60, Math.max(0, m.x - 40)), top: Math.max(0, 10 + m.y - (m.side === "buy" ? -30 : 62)), fontSize: 24, fontWeight: 800, color: "#fff", textShadow: "0 2px 6px #000" }}>{m.usd >= 100 ? `$${Math.round(m.usd).toLocaleString("en-US")}` : money(m.usd)}</div>
            ) : null)}
            <div style={{ display: "flex", position: "absolute", left: CW + 14, top: 10 + y(last.v) - 26, padding: "6px 14px", borderRadius: 12, background: tone, color: "#07070a", fontSize: 28, fontWeight: 800 }}>{axisLabel(last.v)}</div>
            <div style={{ display: "flex", position: "absolute", left: CW + 30, top: 10 + CH - 24, fontSize: 24, color: "rgba(255,255,255,0.3)" }}>{axisLabel(lo)}</div>
            {grid.filter((g) => Math.abs(y(g) - y(last.v)) > 40).map((g, i) => <div key={i} style={{ display: "flex", position: "absolute", left: CW + 30, top: 10 + y(g) - 16, fontSize: 24, color: "rgba(255,255,255,0.3)" }}>{axisLabel(g)}</div>)}
            <div style={{ display: "flex", position: "absolute", left: 0, top: CH + 32, width: CW, justifyContent: "space-between", fontSize: 24, color: "rgba(255,255,255,0.4)" }}>
              {ticks.map((t, i) => <span key={i}>{tick(t, t1 - t0)}</span>)}
            </div>
          </div>

          {/* Encadré du gain */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "auto", borderRadius: 36, border: "1.5px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)", padding: "28px 24px 30px" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              {box.logo !== undefined && (box.logo
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={box.logo} alt="" width={62} height={62} style={{ borderRadius: 62, objectFit: "cover" }} />
                : <div style={{ display: "flex", width: 62, height: 62, borderRadius: 62, background: "rgba(255,255,255,0.12)" }} />)}
              <div style={{ display: "flex", marginLeft: box.logo !== undefined ? 18 : 0, fontSize: 44, fontWeight: 600 }}>{box.title}</div>
              {box.verified && <div style={{ display: "flex", marginLeft: 14, width: 34, height: 34, borderRadius: 34, background: "rgba(255,255,255,0.9)", color: "#07070a", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800 }}>✓</div>}
            </div>
            <div style={{ display: "flex", alignItems: "center", marginTop: 18 }}>
              <div style={{ display: "flex", fontSize: 76, fontWeight: 600, letterSpacing: -2, color: tone }}>{`${good ? "+" : "-"}${money(box.amount)}`}</div>
              {box.pct != null && <div style={{ display: "flex", marginLeft: 22, fontSize: 36, color: "rgba(255,255,255,0.85)" }}>({good ? "▲" : "▼"} {Math.abs(box.pct).toFixed(2)}%)</div>}
            </div>
            {box.details?.length ? (
              <div style={{ display: "flex", marginTop: 16, width: "100%", justifyContent: "center" }}>
                {box.details.slice(0, 3).map((d, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 26px", borderLeft: i ? "1.5px solid rgba(255,255,255,0.12)" : "none" }}>
                    <div style={{ display: "flex", fontSize: 22, color: "rgba(255,255,255,0.45)" }}>{d.label}</div>
                    <div style={{ display: "flex", marginTop: 4, fontSize: 30, fontWeight: 600 }}>{d.value}</div>
                  </div>
                ))}
              </div>
            ) : null}
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
  );
}
