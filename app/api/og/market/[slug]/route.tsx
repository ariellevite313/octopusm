import { ImageResponse } from "next/og";
import { getMarketBySlug } from "@/services/prediction-service";
import { parseMarketOptions } from "@/lib/market/utils";
import { createAdminClient } from "@/lib/supabase/server";
import { ORANGE, BG_MARKS, absUrl, brandLogo, ogFonts } from "@/lib/og/brand";

// Share card for prediction markets and community pools (1200×630).
// Left: dark panel with title + CTA. Right: white panel with the outcomes.

type Row = { label: string; pct: number; image: string | null };
type Card = { title: string; rows: Row[]; versus: boolean; dateLabel: string | null; cover: string | null; volume: string | null };

const fmtDate = (d: string | null | undefined) =>
  d ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(d)) : null;

async function loadCard(slug: string): Promise<Card | null> {
  // 1. Prediction market
  try {
    const m = await getMarketBySlug(slug);
    if (m) {
      const opts = parseMarketOptions(m.options);
      const inv = opts.reduce((s, o) => s + 1 / o.oddsMultiplier, 0);
      const pcts = opts.map((o) => (inv > 0 ? Math.round((1 / o.oddsMultiplier / inv) * 100) : 0));
      const versus = !!(m.left_competitor_name && m.right_competitor_name && opts.length === 2);
      const rows: Row[] = opts.slice(0, 4).map((o, i) => ({
        label: versus ? (i === 0 ? m.left_competitor_name! : m.right_competitor_name!) : o.label,
        pct: pcts[i],
        image: versus ? absUrl(i === 0 ? m.left_competitor_image_src : m.right_competitor_image_src) : null,
      }));
      return { title: m.title, rows, versus, dateLabel: fmtDate(m.event_start_at), cover: absUrl(m.single_image_src), volume: null };
    }
  } catch { /* fall through to pools */ }

  // 2. Community pool
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data: p } = await admin.from("mutuel_markets").select("id,title,cover_image_src,options,total_pool_usdc,created_at").eq("slug", slug).maybeSingle();
    if (!p) return null;
    const opts: { id: string; label: string }[] = typeof p.options === "string" ? JSON.parse(p.options) : p.options ?? [];
    const { data: bets } = await admin.from("mutuel_bets").select("option_id,amount").eq("market_id", p.id).limit(1000);
    const sums = new Map<string, number>();
    let total = 0;
    for (const b of (bets ?? []) as { option_id: string; amount: number }[]) {
      const a = Number(b.amount) || 0; sums.set(b.option_id, (sums.get(b.option_id) ?? 0) + a); total += a;
    }
    const rows: Row[] = opts.slice(0, 4).map((o) => ({
      label: o.label,
      pct: total > 0 ? Math.round(((sums.get(o.id) ?? 0) / total) * 100) : Math.round(100 / Math.max(opts.length, 1)),
      image: null,
    }));
    return { title: p.title, rows, versus: false, dateLabel: fmtDate(p.created_at), cover: absUrl(p.cover_image_src), volume: null };
  } catch { return null; }
}

const chip = (label: string, i: number) => {
  const l = label.trim().toLowerCase();
  if (l === "yes") return { bg: "#dcfce7", fg: "#166534" };
  if (l === "no")  return { bg: "#fee2e2", fg: "#991b1b" };
  return [{ bg: "#ffedd5", fg: "#9a3412" }, { bg: "#e0f2fe", fg: "#075985" }, { bg: "#ede9fe", fg: "#5b21b6" }, { bg: "#fef9c3", fg: "#854d0e" }][i % 4];
};

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [card, brand, fonts] = await Promise.all([loadCard(slug), brandLogo(), ogFonts()]);

  const title = card?.title ?? "Prediction market";
  const titleSize = title.length > 90 ? 40 : title.length > 55 ? 48 : 58;
  const rows = card?.rows ?? [];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#ffffff", fontFamily: "Inter, sans-serif" }}>
        {/* ── Left: dark panel ─────────────────────────────────────────── */}
        <div style={{ position: "relative", display: "flex", flexDirection: "column", width: 600, height: "100%", padding: "44px 48px", color: "#fff", overflow: "hidden", background: "linear-gradient(150deg, #0d0d10 0%, #1a0f08 70%, #2a1406 100%)" }}>
          <div style={{ position: "absolute", left: -140, top: -160, width: 560, height: 560, borderRadius: 560, background: "radial-gradient(circle, rgba(249,115,22,0.30) 0%, rgba(249,115,22,0) 70%)", display: "flex" }} />
          {brand && BG_MARKS.map((m, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={brand} alt="" width={m.s} height={m.s} style={{ position: "absolute", left: m.x, top: m.y, width: m.s, height: m.s, opacity: m.o, transform: `rotate(${m.r}deg)` }} />
          ))}

          <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
            {brand ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand} alt="" width={40} height={40} style={{ width: 40, height: 40, borderRadius: 11 }} />
            ) : null}
            <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.5px" }}>OMdotfun</span>
          </div>

          <div style={{ display: "flex", flex: 1, alignItems: "center", position: "relative" }}>
            <span style={{ fontSize: titleSize, fontWeight: 800, lineHeight: 1.12, letterSpacing: "-1.5px" }}>
              {title.length > 130 ? title.slice(0, 127) + "…" : title}
            </span>
          </div>

          <div style={{ display: "flex", position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", background: ORANGE, borderRadius: 16, padding: "18px 34px" }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: "#fff" }}>Trade With Me</span>
            </div>
          </div>
        </div>

        {/* ── Right: outcomes ──────────────────────────────────────────── */}
        <div style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, height: "100%", padding: "44px 48px", background: "#ffffff", overflow: "hidden" }}>
          <div style={{ position: "absolute", right: -160, top: -160, width: 420, height: 420, borderRadius: 420, background: "rgba(249,115,22,0.09)", display: "flex" }} />

          {card?.dateLabel && (
            <span style={{ fontSize: 22, color: "#8a8a93", fontWeight: 600, position: "relative" }}>{card.dateLabel}</span>
          )}

          <div style={{ display: "flex", flex: 1, flexDirection: card?.versus ? "row" : "column", justifyContent: "center", alignItems: card?.versus ? "center" : "stretch", gap: card?.versus ? 28 : 16, position: "relative" }}>
            {card?.versus
              ? rows.map((r, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, gap: 14 }}>
                    {r.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.image} alt="" width={150} height={150} style={{ width: 150, height: 150, borderRadius: 24, objectFit: "cover", background: "#f4f4f5" }} />
                    ) : (
                      <div style={{ width: 150, height: 150, borderRadius: 24, background: "#f4f4f5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 56, fontWeight: 800, color: ORANGE }}>{r.label.slice(0, 1)}</div>
                    )}
                    <span style={{ fontSize: 26, fontWeight: 800, color: "#0b0b11", textAlign: "center", lineHeight: 1.15 }}>{r.label.length > 18 ? r.label.slice(0, 17) + "…" : r.label}</span>
                    <div style={{ display: "flex", background: "#fff1e6", borderRadius: 40, padding: "8px 22px" }}>
                      <span style={{ fontSize: 30, fontWeight: 800, color: ORANGE }}>{r.pct}%</span>
                    </div>
                  </div>
                ))
              : rows.map((r, i) => {
                  const c = chip(r.label, i);
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f7f7f8", borderRadius: 20, padding: "20px 26px" }}>
                      <span style={{ fontSize: 30, fontWeight: 800, color: "#0b0b11" }}>{r.label.length > 22 ? r.label.slice(0, 21) + "…" : r.label}</span>
                      <div style={{ display: "flex", background: c.bg, borderRadius: 40, padding: "6px 20px" }}>
                        <span style={{ fontSize: 30, fontWeight: 800, color: c.fg }}>{r.pct}%</span>
                      </div>
                    </div>
                  );
                })}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, borderTop: "2px solid #eeeef0", paddingTop: 20, position: "relative" }}>
            {brand ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand} alt="" width={34} height={34} style={{ width: 34, height: 34, borderRadius: 9 }} />
            ) : null}
            <span style={{ fontSize: 24, fontWeight: 800, color: "#0b0b11" }}>omdot.fun</span>
          </div>
        </div>
      </div>
    ),
    fonts ? { width: 1200, height: 630, fonts } : { width: 1200, height: 630 },
  );
}
