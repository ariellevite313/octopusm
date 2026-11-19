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
const UP = "#3ddc84", DOWN = "#ff5d4d";
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

export async function topCardResponse(p: { source: TopSource; kind: TopKind; period: TopPeriod; rows: TopRow[]; at: number; origin: string; wide?: boolean }) {
  const om = p.source === "om";
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
  const color = p.kind === "gainers" ? UP : p.kind === "losers" || p.kind === "dev_sold" ? DOWN : "#ffffff";
  const grid = (a: React.ReactNode, b: React.ReactNode, c: React.ReactNode, d: React.ReactNode, style: React.CSSProperties) => (
    <div style={{ display: "flex", alignItems: "center", ...style }}>
      <div style={{ display: "flex", width: 52 }}>{a}</div>
      <div style={{ display: "flex", width: 330, alignItems: "center" }}>{b}</div>
      <div style={{ display: "flex", width: 180, alignItems: "center" }}>{c}</div>
      <div style={{ display: "flex", flex: 1, alignItems: "center" }}>{d}</div>
    </div>
  );

  const card = (
    <div style={{ display: "flex", flexDirection: "column", width: W, height: H, background: "#050505", color: "#fff", fontFamily: "Inter", position: "relative" }}>
      <div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: W, height: H, backgroundImage: "linear-gradient(115deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.05) 18%, rgba(255,255,255,0) 34%)" }} />
      <div style={{ display: "flex", flexDirection: "column", padding: "70px 64px 0" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", fontSize: 66, fontWeight: 800, lineHeight: 1.04, textTransform: "uppercase", letterSpacing: -1 }}>
          <span>{t1}</span><span>{t2}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 18, fontSize: 24, color: "#9a9a9a" }}>{sub}</div>
        {grid(<span>#</span>, <span>Token</span>, <span>{col2}</span>, <span>{col3}</span>, { marginTop: 44, padding: "0 18px 18px", fontSize: 22, color: "#cfcfcf", borderBottom: "1px solid #2a2a2a" })}
        {rows.length === 0 && <div style={{ display: "flex", justifyContent: "center", padding: "80px 0", fontSize: 28, color: "#9a9a9a" }}>No token to show right now</div>}
        {rows.map((r, i) => {
          const w = Math.max(3, (Math.abs(r.value) / max) * 100) * 1.9;
          const cl = chainLogo.get(r.chain);
          return (
            <div key={i} style={{ display: "flex" }}>
              {grid(
                <span style={{ fontSize: 22, fontWeight: 600, color: i === 0 ? "#fff" : "#7d7d7d" }}>{i + 1}</span>,
                <div style={{ display: "flex", alignItems: "center" }}>
                  {logos[i]
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={logos[i]!} alt="" width={56} height={56} style={{ borderRadius: 28, objectFit: "cover" }} />
                    : <div style={{ display: "flex", width: 56, height: 56, borderRadius: 28, background: "#262626", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800 }}>{r.symbol.slice(0, 1)}</div>}
                  <div style={{ display: "flex", flexDirection: "column", marginLeft: 16 }}>
                    <span style={{ fontSize: 26, fontWeight: 600 }}>{r.name.length > 17 ? `${r.name.slice(0, 16).trim()}…` : r.name}</span>
                    <span style={{ fontSize: 18, color: "#8a8a8a" }}>${r.symbol.replace(/^\$+/, "").slice(0, 12)}</span>
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
                  <div style={{ display: "flex", width: w, height: 40, borderRadius: 3, backgroundImage: "linear-gradient(90deg, #0d0d0d, #5a5a5a 55%, #f5f5f5)" }} />
                  <span style={{ marginLeft: 16, fontSize: 25, fontWeight: 800, color }}>{valueText(p.kind, r.value)}</span>
                </div>,
                { height: 86, padding: "0 18px", width: "100%", borderBottom: "1px solid #222", background: i % 2 ? "rgba(255,255,255,0.05)" : "transparent" },
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", position: "absolute", left: 64, right: 64, bottom: 44, justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", fontSize: 28, fontWeight: 800 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo && <img src={logo} alt="" width={52} height={52} style={{ marginRight: 14 }} />}
          <span>OMdot.fun</span>
        </div>
        <span style={{ fontSize: 24, color: "#bdbdbd" }}>{om ? "Launchpad" : "Terminal"}</span>
      </div>
    </div>
  );

  const headers = { "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable" };
  if (!p.wide) return new ImageResponse(card, { width: W, height: H, fonts, headers });
  const png = Buffer.from(await new ImageResponse(card, { width: W, height: H, fonts }).arrayBuffer()).toString("base64");
  const h = WH - 30, w = Math.round((h * W) / H);
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: WW, height: WH, alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at 20% 10%, #2a2a33 0%, #0b0b0f 50%, #050506 100%)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`data:image/png;base64,${png}`} alt="" width={w} height={h} />
      </div>
    ),
    { width: WW, height: WH, fonts, headers },
  );
}
