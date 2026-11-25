/**
 * Image « Top 10 » (1080×1350) : titre, sous-titre (source, période, date), tableau à 3 colonnes
 * (token, chaîne ou capitalisation, barre + valeur), pied OMdot.fun. wide=1 : la même image au centre d'un 1200×630.
 */
import React from "react";
import { ImageResponse } from "next/og";
import { ogFonts } from "@/lib/og/brand";
import { localImage, money, remoteImage } from "@/lib/og/pnl-card";
import { CHAINS } from "@/lib/terminal";
import { WIN_SOURCE, type TopKind, type TopPeriod, type TopRow, type TopSource } from "@/lib/top-lists";

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

export function topTitle(kind: TopKind, period: TopPeriod, source?: TopSource): [string, string] {
  if (source === "winners") return ["Top 10", "platform winners"];
  if (kind === "mcap") return ["Top 10", "by market cap"];
  if (kind === "volume") return ["Top 10 by volume", PERIOD_OF[period]];
  if (kind === "gainers") return ["Top gainers", PERIOD_OF[period]];
  if (kind === "losers") return ["Biggest losers", PERIOD_OF[period]];
  return ["Top tokens", "sold by the team"];
}

function valueText(kind: TopKind, v: number, source?: TopSource) {
  if (source === "winners") return `+$${v >= 1000 ? Math.round(v).toLocaleString("en-US") : v.toFixed(2)}`;
  if (kind === "gainers" || kind === "losers") return `${v > 0 ? "+" : ""}${Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1)}%`;
  if (kind === "dev_sold") return v >= 99.5 ? "Sold all" : `${Math.round(v)}% sold`;
  return money(v);
}

/** Styles d'affichage : « table » (tableau d'origine) ou « cards » (une carte arrondie par token, gros classement). */
export const TOP_STYLES = ["table", "cards"] as const;
export type TopStyle = (typeof TOP_STYLES)[number];
export const isTopStyle = (s: string | null): s is TopStyle => !!s && (TOP_STYLES as readonly string[]).includes(s);
const ordinal = (n: number) => (n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th");

export async function topCardResponse(p: { source: TopSource; kind: TopKind; period: TopPeriod; rows: TopRow[]; at: number; origin: string; wide?: boolean; theme?: TopTheme; style?: TopStyle }) {
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
  const win = p.source === "winners";
  const [t1, t2] = topTitle(p.kind, p.period, p.source);
  const date = new Date(p.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const time = new Date(p.at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
  const sub = [win ? "OMdotfun · All time" : om ? "OM Launchpad · All chains" : chainName(p.source), `${date}, ${time} UTC`].join(" · ");
  const col2 = win ? (p.rows.some((r) => WIN_SOURCE[r.chain]) ? "From" : "Wins") : om ? "Chain" : "Market cap";
  const col3 = win ? "Gains" : p.kind === "mcap" ? "Market cap" : p.kind === "volume" ? `Volume ${PERIOD[p.period]}` : p.kind === "dev_sold" ? "Team" : `Change ${PERIOD[p.period]}`;
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

  // Style « cartes » : titre géant, une carte claire par token (rang, logo avec puce de chaîne, $TICKER, valeur à droite)
  const light = p.theme === "white" || p.theme === "yellow";
  // Fond noir : cartes sombres et texte blanc (pas de bulles blanches)
  const dk = (p.theme ?? "dark") === "dark";
  const cardBg = dk ? "#18181c" : p.theme === "white" ? "#ffffff" : "rgba(250,250,248,0.96)";
  const cInk = dk ? "#ffffff" : "#0a0a0a", cMuted = dk ? "#8a8a90" : "#a3a3a0", cRing = dk ? "#2c2c33" : "#e4e4e0", cAvatar = dk ? "#26262c" : "#e9e9e5";
  const cUp = "#16a34a", cDown = "#e5397f";
  const vColor = p.kind === "gainers" || win ? (dk ? "#3ddc84" : cUp) : p.kind === "losers" || p.kind === "dev_sold" ? (dk ? "#ff5d8f" : cDown) : cInk;
  const suffix = (r: TopRow) => win ? (WIN_SOURCE[r.chain] ?? "") : p.kind === "mcap" ? "mcap" : p.kind === "volume" ? `vol ${PERIOD[p.period]}` : p.kind === "dev_sold" ? "team" : PERIOD[p.period];
  const cardsCard = (
    <div style={{ display: "flex", flexDirection: "column", width: W, height: H, background: th.wide, color: th.text, fontFamily: "Inter", position: "relative", overflow: "hidden" }}>
      {/* Grand mot en filigrane en bas, comme sur la référence */}
      <div style={{ display: "flex", position: "absolute", left: -20, bottom: -150, fontSize: 420, fontWeight: 800, letterSpacing: -20, color: light ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.13)" }}>OMDOT</div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {logo && <img src={logo} alt="" width={220} height={220} style={{ position: "absolute", left: -40, bottom: -60, transform: "rotate(-14deg)" }} />}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "44px 56px 0" }}>
        <div style={{ display: "flex", fontSize: 96, fontWeight: 800, letterSpacing: -4, lineHeight: 1 }}>{win ? "Top 10 winners" : t1 === "Top 10" ? `Top 10 ${t2.replace(/^by /, "")}` : t1}</div>
        <div style={{ display: "flex", marginTop: 14, fontSize: 28, fontWeight: 600, color: th.sub, textAlign: "center" }}>{(win || t1 === "Top 10" ? "" : `${t2[0].toUpperCase()}${t2.slice(1)} · `) + sub}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", padding: "30px 56px 0" }}>
        {rows.length === 0 && <div style={{ display: "flex", justifyContent: "center", padding: "80px 0", fontSize: 30, color: th.sub }}>No token to show right now</div>}
        {rows.map((r, i) => {
          const cl = win ? null : chainLogo.get(r.chain) ?? chainLogo.get(p.source) ?? null;
          const name = win ? (r.name.length > 13 ? `${r.name.slice(0, 12).trim()}…` : r.name) : `$${r.symbol.replace(/^\$+/, "").slice(0, 12)}`;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", height: 84, marginBottom: 10, padding: "0 30px 0 22px", borderRadius: 26, background: cardBg, color: cInk, boxShadow: dk ? "none" : "0 6px 18px rgba(0,0,0,0.10)", border: dk ? "1px solid #26262c" : "none" }}>
              <div style={{ display: "flex", width: 104, alignItems: "flex-start" }}>
                <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: -2, lineHeight: 1 }}>{i + 1}</span>
                <span style={{ fontSize: 20, fontWeight: 800, marginLeft: 2, marginTop: 2 }}>{ordinal(i + 1)}</span>
              </div>
              <div style={{ display: "flex", position: "relative", width: 58, height: 58 }}>
                {logos[i]
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={logos[i]!} alt="" width={58} height={58} style={{ borderRadius: 29, objectFit: "cover", border: `3px solid ${cRing}` }} />
                  : <div style={{ display: "flex", width: 58, height: 58, borderRadius: 29, background: cAvatar, alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 800 }}>{(win ? r.name : r.symbol).replace(/^\$+/, "").slice(0, 1).toUpperCase()}</div>}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {cl && <img src={cl} alt="" width={24} height={24} style={{ position: "absolute", right: -4, bottom: -4, borderRadius: 6, border: `2px solid ${cardBg}`, background: cardBg }} />}
              </div>
              <span style={{ marginLeft: 20, fontSize: 34, fontWeight: 800, letterSpacing: -1 }}>{name}</span>
              <div style={{ display: "flex", flex: 1 }} />
              <span style={{ fontSize: 32, fontWeight: 800, color: vColor }}>{valueText(p.kind, r.value, p.source)}</span>
              <span style={{ marginLeft: 10, fontSize: 26, fontWeight: 600, color: cMuted }}>{suffix(r)}</span>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", position: "absolute", right: 56, bottom: 34, alignItems: "center", fontSize: 44, fontWeight: 800, letterSpacing: -1.5, color: th.text }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo && <img src={logo} alt="" width={50} height={50} style={{ marginRight: 12 }} />}
        <span>omdot.fun</span>
      </div>
    </div>
  );

  const card = p.style === "cards" ? cardsCard : (
    <div style={{ display: "flex", flexDirection: "column", width: W, height: H, background: th.bg, color: th.text, fontFamily: "Inter", position: "relative" }}>
      <div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: W, height: H, backgroundImage: th.glow }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={pattern(th.ink, th.inkA)} alt="" width={W} height={H} style={{ position: "absolute", left: 0, top: 0 }} />
      <div style={{ display: "flex", flexDirection: "column", padding: "70px 64px 0" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", fontSize: 66, fontWeight: 800, lineHeight: 1.04, textTransform: "uppercase", letterSpacing: -1 }}>
          <span>{t1}</span><span>{t2}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 18, fontSize: 24, color: th.sub }}>{sub}</div>
        {grid(<span>#</span>, <span>{win ? "Player" : "Token"}</span>, <span>{col2}</span>, <span>{col3}</span>, { marginTop: 44, padding: "0 18px 18px", fontSize: 22, color: th.head, borderBottom: `1px solid ${th.head_line}` })}
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
                    <span style={{ fontSize: 18, color: th.sym }}>{win ? r.symbol : `$${r.symbol.replace(/^\$+/, "").slice(0, 12)}`}</span>
                  </div>
                </div>,
                win
                  ? <span style={{ fontSize: 24 }}>{WIN_SOURCE[r.chain] ?? r.mcap ?? 0}</span>
                  : om
                  ? <div style={{ display: "flex", alignItems: "center", fontSize: 24 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {cl && <img src={cl} alt="" width={40} height={40} style={{ borderRadius: 20, marginRight: 12 }} />}
                      <span>{chainName(r.chain)}</span>
                    </div>
                  : <span style={{ fontSize: 24 }}>{r.mcap ? money(r.mcap) : "-"}</span>,
                <div style={{ display: "flex", alignItems: "center" }}>
                  <div style={{ display: "flex", width: w, height: 40, borderRadius: 3, backgroundImage: th.bar }} />
                  <span style={{ marginLeft: 16, fontSize: 25, fontWeight: 800, color }}>{valueText(p.kind, r.value, p.source)}</span>
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
          {logo && <img src={logo} alt="" width={32} height={32} style={{ marginRight: 10 }} />}
          <span>OMDOT.FUN</span>
        </div>
        <span style={{ fontSize: 24, color: th.foot }}>{win ? "Leaderboard" : om ? "Launchpad" : "Terminal"}</span>
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
