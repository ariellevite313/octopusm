/**
 * Image « Top 10 » (1080×1350) : titre, sous-titre (source, période, date), tableau à 3 colonnes
 * (token, chaîne ou capitalisation, barre + valeur), pied OMdot.fun. wide=1 : la même image au centre d'un 1200×630.
 */
import React from "react";
import { ImageResponse } from "next/og";
import { ogFonts } from "@/lib/og/brand";
import { localImage, money, remoteImage } from "@/lib/og/pnl-card";
import { CHAINS } from "@/lib/terminal";
import type { TopKind, TopPeriod, TopRow, TopSource } from "@/lib/top-lists";

const W = 1080, H = 1350, WW = 1200, WH = 630;
/** Couleurs de l'image : fond, texte, barres, motif léger. « dark » est l'image d'origine. */
type Theme = { bg: string; glow: string; text: string; sub: string; head: string; dim: string; sym: string; line: string; head_line: string; alt: string; avatar: string; bar: string; foot: string; wide: string; up: string; down: string; ink: string; inkA: number };
export const TOP_THEMES = ["dark", "white", "blue", "orange", "yellow", "green", "pink"] as const;
export type TopTheme = (typeof TOP_THEMES)[number];
/** Fond foncé (texte blanc) */
const onDark = (bg: string, glow: string, wide: string, bar: string, up = "#3ddc84", down = "#ff5d4d", inkA = 0.07): Theme => ({
  bg, glow, text: "#ffffff", sub: "rgba(255,255,255,0.72)", head: "rgba(255,255,255,0.86)", dim: "rgba(255,255,255,0.55)", sym: "rgba(255,255,255,0.66)",
  line: "rgba(255,255,255,0.14)", head_line: "rgba(255,255,255,0.24)", alt: "rgba(255,255,255,0.06)", avatar: "rgba(255,255,255,0.18)", bar, foot: "rgba(255,255,255,0.82)", wide,
  up, down, ink: "#ffffff", inkA,
});
/** Fond clair (texte noir) */
const onLight = (bg: string, glow: string, wide: string, bar: string, up: string, down: string, inkA = 0.08): Theme => ({
  bg, glow, text: "#0a0a0a", sub: "rgba(0,0,0,0.6)", head: "rgba(0,0,0,0.78)", dim: "rgba(0,0,0,0.42)", sym: "rgba(0,0,0,0.55)",
  line: "rgba(0,0,0,0.09)", head_line: "rgba(0,0,0,0.16)", alt: "rgba(0,0,0,0.04)", avatar: "rgba(0,0,0,0.1)", bar, foot: "rgba(0,0,0,0.7)", wide,
  up, down, ink: "#000000", inkA,
});
const shine = (c: string) => `linear-gradient(115deg, ${c} 0%, rgba(255,255,255,0) 38%)`;
const THEMES: Record<TopTheme, Theme> = {
  dark: onDark("#050505", shine("rgba(255,255,255,0.14)"), "radial-gradient(circle at 20% 10%, #2a2a33 0%, #0b0b0f 50%, #050506 100%)", "linear-gradient(90deg, #0d0d0d, #5a5a5a 55%, #f5f5f5)", undefined, undefined, 0.06),
  white: onLight("#fafaf8", shine("rgba(255,255,255,0.9)"), "radial-gradient(circle at 20% 10%, #ffffff 0%, #efefec 55%, #e2e2de 100%)", "linear-gradient(90deg, #efefeb, #9d9d99 55%, #111111)", "#0f9d4a", "#d9332a", 0.07),
  blue: onDark("#1747c9", shine("rgba(255,255,255,0.22)"), "radial-gradient(circle at 20% 10%, #3a6cf0 0%, #1747c9 55%, #0d2f8f 100%)", "linear-gradient(90deg, rgba(255,255,255,0.12), rgba(255,255,255,0.5) 55%, #ffffff)", "#7dffb0", "#ffb3a8", 0.09),
  orange: onDark("#f26a12", shine("rgba(255,255,255,0.24)"), "radial-gradient(circle at 20% 10%, #ff9440 0%, #f26a12 55%, #b84a06 100%)", "linear-gradient(90deg, rgba(255,255,255,0.12), rgba(255,255,255,0.5) 55%, #ffffff)", "#ffffff", "#2a0d00", 0.1),
  yellow: onLight("#ffd21f", shine("rgba(255,255,255,0.4)"), "radial-gradient(circle at 20% 10%, #ffe36b 0%, #ffd21f 55%, #e0b400 100%)", "linear-gradient(90deg, rgba(0,0,0,0.08), rgba(0,0,0,0.4) 55%, #0a0a0a)", "#0b6b31", "#b3200f", 0.09),
  green: onDark("#0f9b55", shine("rgba(255,255,255,0.22)"), "radial-gradient(circle at 20% 10%, #23c071 0%, #0f9b55 55%, #086a39 100%)", "linear-gradient(90deg, rgba(255,255,255,0.12), rgba(255,255,255,0.5) 55%, #ffffff)", "#ffffff", "#3a0500", 0.1),
  pink: onDark("#e93a8c", shine("rgba(255,255,255,0.24)"), "radial-gradient(circle at 20% 10%, #ff6fb0 0%, #e93a8c 55%, #a91d60 100%)", "linear-gradient(90deg, rgba(255,255,255,0.12), rgba(255,255,255,0.5) 55%, #ffffff)", "#ffffff", "#3a0016", 0.1),
};

/** Motif léger : grille de points, anneaux concentriques discrets dans deux coins (loin du titre). SVG en data URI. */
function pattern(ink: string, a: number): string {
  const dots: string[] = [];
  for (let y = 24; y < H; y += 40) for (let x = 24; x < W; x += 40) dots.push(`<circle cx="${x}" cy="${y}" r="1.5" fill="${ink}" fill-opacity="${(a * 1.4).toFixed(3)}"/>`);
  const rings = (cx: number, cy: number) => Array.from({ length: 4 }, (_, i) => `<circle cx="${cx}" cy="${cy}" r="${70 + i * 52}" fill="none" stroke="${ink}" stroke-opacity="${(a * 0.9).toFixed(3)}" stroke-width="2"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${dots.join("")}${rings(W + 30, -30)}${rings(-30, H + 30)}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
export const isTheme = (t: string | null): t is TopTheme => !!t && (TOP_THEMES as readonly string[]).includes(t);
const chainName = (c: string) => (c === "stocks" ? "Tokenized stocks · Solana" : CHAINS.find((x) => x.id === c)?.name ?? c);
const PERIOD: Record<TopPeriod, string> = { day: "24h", week: "7 days", month: "30 days" };
const PERIOD_OF: Record<TopPeriod, string> = { day: "of the day", week: "of the week", month: "of the month" };

export function topTitle(kind: TopKind, period: TopPeriod): [string, string] {
  if (kind === "mcap") return ["Top 10", "by market cap"];
  if (kind === "volume") return ["Top 10 by volume", PERIOD_OF[period]];
  if (kind === "gainers") return ["Top gainers", PERIOD_OF[period]];
  if (kind === "losers") return ["Biggest losers", PERIOD_OF[period]];
  return ["Top tokens", "sold by the team"];
}

function valueText(kind: TopKind, v: number) {
  if (kind === "gainers" || kind === "losers") return `${v > 0 ? "+" : ""}${Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1)}%`;
  if (kind === "dev_sold") return v >= 99.5 ? "Sold all" : `${Math.round(v)}% sold`;
  return money(v);
}

export async function topCardResponse(p: { source: TopSource; kind: TopKind; period: TopPeriod; rows: TopRow[]; at: number; origin: string; wide?: boolean; theme?: TopTheme }) {
  const om = p.source === "om";
  const th = THEMES[p.theme ?? "dark"], UP = th.up, DOWN = th.down;
  const rows = p.rows.slice(0, 10);
  const [fonts, logo, logos, chainLogos] = await Promise.all([
    ogFonts(),
    localImage("og-logo.png"),
    Promise.all(rows.map((r) => remoteImage(r.logo, p.origin))),
    Promise.all([...new Set(rows.map((r) => r.chain).concat(om || p.source === "stocks" ? [] : [p.source]))].map(async (c) => [c, await localImage(`chains/${c}.png`)] as const)),
  ]);
  const chainLogo = new Map(chainLogos);
  const [t1, t2] = topTitle(p.kind, p.period);
  const date = new Date(p.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const time = new Date(p.at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
  const sub = [om ? "OM Launchpad · All chains" : chainName(p.source), `${date}, ${time} UTC`].join(" · ");
  const col2 = om ? "Chain" : "Market cap";
  const col3 = p.kind === "mcap" ? "Market cap" : p.kind === "volume" ? `Volume ${PERIOD[p.period]}` : p.kind === "dev_sold" ? "Team" : `Change ${PERIOD[p.period]}`;
  const max = Math.max(1e-9, ...rows.map((r) => Math.abs(r.value)));
  const color = p.kind === "gainers" ? UP : p.kind === "losers" || p.kind === "dev_sold" ? DOWN : th.text;
  const grid = (a: React.ReactNode, b: React.ReactNode, c: React.ReactNode, d: React.ReactNode, style: React.CSSProperties) => (
    <div style={{ display: "flex", alignItems: "center", ...style }}>
      <div style={{ display: "flex", width: 52 }}>{a}</div>
      <div style={{ display: "flex", width: 330, alignItems: "center" }}>{b}</div>
      <div style={{ display: "flex", width: 180, alignItems: "center" }}>{c}</div>
      <div style={{ display: "flex", flex: 1, alignItems: "center" }}>{d}</div>
    </div>
  );

  const card = (
    <div style={{ display: "flex", flexDirection: "column", width: W, height: H, background: th.bg, color: th.text, fontFamily: "Inter", position: "relative" }}>
      <div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: W, height: H, backgroundImage: th.glow }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={pattern(th.ink, th.inkA)} alt="" width={W} height={H} style={{ position: "absolute", left: 0, top: 0 }} />
      <div style={{ display: "flex", flexDirection: "column", padding: "70px 64px 0" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", fontSize: 66, fontWeight: 800, lineHeight: 1.04, textTransform: "uppercase", letterSpacing: -1 }}>
          <span>{t1}</span><span>{t2}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 18, fontSize: 24, color: th.sub }}>{sub}</div>
        {grid(<span>#</span>, <span>Token</span>, <span>{col2}</span>, <span>{col3}</span>, { marginTop: 44, padding: "0 18px 18px", fontSize: 22, color: th.head, borderBottom: `1px solid ${th.head_line}` })}
        {rows.length === 0 && <div style={{ display: "flex", justifyContent: "center", padding: "80px 0", fontSize: 28, color: th.sub }}>No token to show right now</div>}
        {rows.map((r, i) => {
          const w = Math.max(3, (Math.abs(r.value) / max) * 100) * 1.9;
          const cl = chainLogo.get(r.chain);
          return (
            <div key={i} style={{ display: "flex" }}>
              {grid(
                <span style={{ fontSize: 22, fontWeight: 600, color: i === 0 ? th.text : th.dim }}>{i + 1}</span>,
                <div style={{ display: "flex", alignItems: "center" }}>
                  {logos[i]
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={logos[i]!} alt="" width={56} height={56} style={{ borderRadius: 28, objectFit: "cover" }} />
                    : <div style={{ display: "flex", width: 56, height: 56, borderRadius: 28, background: th.avatar, alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800 }}>{r.symbol.slice(0, 1)}</div>}
                  <div style={{ display: "flex", flexDirection: "column", marginLeft: 16 }}>
                    <span style={{ fontSize: 26, fontWeight: 600 }}>{r.name.length > 17 ? `${r.name.slice(0, 16).trim()}…` : r.name}</span>
                    <span style={{ fontSize: 18, color: th.sym }}>${r.symbol.replace(/^\$+/, "").slice(0, 12)}</span>
                  </div>
                </div>,
                om
                  ? <div style={{ display: "flex", alignItems: "center", fontSize: 24 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {cl && <img src={cl} alt="" width={40} height={40} style={{ borderRadius: 20, marginRight: 12 }} />}
                      <span>{chainName(r.chain)}</span>
                    </div>
                  : <span style={{ fontSize: 24 }}>{r.mcap ? money(r.mcap) : "-"}</span>,
                <div style={{ display: "flex", alignItems: "center" }}>
                  <div style={{ display: "flex", width: w, height: 40, borderRadius: 3, backgroundImage: th.bar }} />
                  <span style={{ marginLeft: 16, fontSize: 25, fontWeight: 800, color }}>{valueText(p.kind, r.value)}</span>
                </div>,
                { height: 86, padding: "0 18px", width: "100%", borderBottom: `1px solid ${th.line}`, background: i % 2 ? th.alt : "transparent" },
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", position: "absolute", left: 64, right: 64, bottom: 44, justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", fontSize: 28, fontWeight: 800 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo && <img src={logo} alt="" width={52} height={52} style={{ marginRight: 14 }} />}
          <span>OMDOT.FUN</span>
        </div>
        <span style={{ fontSize: 24, color: th.foot }}>{om ? "Launchpad" : "Terminal"}</span>
      </div>
    </div>
  );

  const headers = { "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable" };
  if (!p.wide) return new ImageResponse(card, { width: W, height: H, fonts, headers });
  const png = Buffer.from(await new ImageResponse(card, { width: W, height: H, fonts }).arrayBuffer()).toString("base64");
  const h = WH - 30, w = Math.round((h * W) / H);
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: WW, height: WH, alignItems: "center", justifyContent: "center", background: th.wide }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`data:image/png;base64,${png}`} alt="" width={w} height={h} />
      </div>
    ),
    { width: WW, height: WH, fonts, headers },
  );
}
