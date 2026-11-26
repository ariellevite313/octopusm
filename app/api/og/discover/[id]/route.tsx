/**
 * GET /api/og/discover/:id : image d'aperçu (1200×630) d'une fiche OM Store, comme son en-tête :
 * bannière en fond, propriétaire, nom et badge vérifié, accroche, note, visites, catégorie, réseau, icône.
 * Toujours à jour : chiffres relus à chaque génération (cache 5 min), et l'adresse de l'image change avec eux.
 */
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfiles } from "@/lib/profiles";
import { APP_CATEGORY_LABEL, type AppCategory } from "@/lib/discover";
import { shortAddress } from "@/lib/format";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SITE = "https://omdot.fun";
const size = { width: 1200, height: 630 };

async function fonts() {
  const dir = path.join(process.cwd(), "assets", "fonts");
  try {
    const [r, sb, eb] = await Promise.all(["Inter-Regular.otf", "Inter-SemiBold.otf", "Inter-ExtraBold.otf"].map((f) => readFile(path.join(dir, f))));
    return [
      { name: "Inter", data: r, weight: 400 as const, style: "normal" as const },
      { name: "Inter", data: sb, weight: 600 as const, style: "normal" as const },
      { name: "Inter", data: eb, weight: 800 as const, style: "normal" as const },
    ];
  } catch { return undefined; }
}
async function pub(file: string): Promise<string | null> {
  try { return `data:image/png;base64,${(await readFile(path.join(process.cwd(), "public", file))).toString("base64")}`; } catch { return null; }
}
const abs = (u: string | null | undefined) => (!u ? null : u.startsWith("http") ? u : `${SITE}${u.startsWith("/") ? "" : "/"}${u}`);
/** Image distante lue côté serveur (4 s max) et passée en data URI : une image qui ne répond pas ne casse pas l'aperçu. */
async function inline(u: string | null): Promise<string | null> {
  if (!u) return null;
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const type = r.headers.get("content-type") ?? "image/png";
    if (!/^image\/(png|jpe?g|gif|webp)/.test(type)) return null;
    return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  } catch { return null; }
}
const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n));

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const f = await fonts();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: app } = UUID.test(id)
    ? await db.from("discover_apps").select("id, owner, name, tagline, category, icon_url, banner_url, rating_avg, rating_count, status").eq("id", id).eq("status", "live").maybeSingle()
    : { data: null };
  if (!app) {
    return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#F4F4F6", fontSize: 40, color: "#71717a", fontFamily: "Inter" }}>OM Store</div>, { ...size, fonts: f });
  }
  const [extra, profiles, arc, sol, brand] = await Promise.all([
    db.from("discover_apps").select("visits, network, verified").eq("id", id).maybeSingle().then((r: { data: unknown }) => (r.data ?? {}) as { visits?: number; network?: string | null; verified?: boolean }, () => ({} as { visits?: number; network?: string | null; verified?: boolean })),
    getProfiles(db, [app.owner]),
    pub("chains/arc.png"), pub("chains/solana.png"), pub("omdot-icon.png"),
  ]);
  const owner = profiles.get(app.owner)?.name ?? shortAddress(app.owner);
  const net = extra.network === "arc" ? "Arc" : extra.network === "solana" || !extra.network ? "Solana" : String(extra.network).replace(/^\w/, (c) => c.toUpperCase());
  const netLogo = extra.network === "arc" ? arc : net === "Solana" ? sol : null;
  const cat = APP_CATEGORY_LABEL[app.category as AppCategory] ?? "App";
  const rating = Number(app.rating_avg) || 0;
  const count = Number(app.rating_count) || 0;
  const [banner, icon] = await Promise.all([inline(abs(app.banner_url)), inline(abs(app.icon_url))]);
  const nameSize = app.name.length > 18 ? 64 : app.name.length > 12 ? 80 : 92;

  const stat = (value: React.ReactNode, label: string, last = false) => (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, borderRight: last ? "none" : "2px solid #E4E4E7" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 40, fontWeight: 800, color: "#0A0A0B" }}>{value}</div>
      <div style={{ fontSize: 26, color: "#71717A" }}>{label}</div>
    </div>
  );

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#F4F4F6", fontFamily: "Inter" }}>
      {/* Bannière du projet en fond, fondue dans le gris clair */}
      {banner && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={banner} alt="" width={1200} height={630} style={{ position: "absolute", left: 0, top: 0, width: 1200, height: 630, objectFit: "cover", opacity: 0.24 }} />
      )}
      <div style={{ position: "absolute", left: 0, top: 0, width: 1200, height: 630, display: "flex", background: "linear-gradient(180deg, rgba(244,244,246,0.35) 0%, rgba(244,244,246,0.85) 55%, #F4F4F6 100%)" }} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", width: "100%", padding: "56px 64px 76px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 860 }}>
            <div style={{ fontSize: 32, fontWeight: 600, color: "#0A0A0B" }}>{owner}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <div style={{ fontSize: nameSize, fontWeight: 800, color: "#0A0A0B", letterSpacing: -2, lineHeight: 1 }}>{app.name}</div>
              {extra.verified && (
                <svg width="56" height="56" viewBox="0 0 24 24"><path fill="#1D9BF0" d="M12 1.5l2.6 1.9 3.2-.2 1 3.1 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3.1-3.2-.2L12 22.5l-2.6-1.9-3.2.2-1-3.1-2.6-1.9 1-3.1-1-3.1 2.6-1.9 1-3.1 3.2.2z" /><path d="M7.5 12.2l3 3 6-6.2" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              )}
            </div>
          </div>
          {icon
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={icon} alt="" width={190} height={190} style={{ width: 190, height: 190, borderRadius: 44, objectFit: "cover" }} />
            : <div style={{ width: 190, height: 190, borderRadius: 44, background: "#0A0A0B" }} />}
        </div>
        <div style={{ marginTop: 30, fontSize: 34, color: "#52525B", maxWidth: 1060, display: "flex" }}>{app.tagline.length > 80 ? app.tagline.slice(0, 78) + "…" : app.tagline}</div>
        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", paddingTop: 24 }}>
          {stat(<><span>{rating ? rating.toFixed(1) : "-"}</span><svg width="34" height="34" viewBox="0 0 24 24"><path fill="#0A0A0B" d="M12 2.5l2.9 6.1 6.6.8-4.9 4.5 1.3 6.6L12 17.2l-5.9 3.3 1.3-6.6-4.9-4.5 6.6-.8z" /></svg></>, `${count} ${count === 1 ? "review" : "reviews"}`)}
          {stat(<span>{compact(Number(extra.visits) || 0)}</span>, "Visits")}
          {stat(<span>{cat}</span>, "Category")}
          {stat(<>{netLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={netLogo} alt="" width={40} height={40} style={{ width: 40, height: 40, borderRadius: 20, marginRight: 4 }} />)}<span>{net}</span></>, "Network", true)}
        </div>
        <div style={{ position: "absolute", left: 64, bottom: 18, display: "flex", alignItems: "center", gap: 10, fontSize: 20, color: "#A1A1AA" }}>
          {brand && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand} alt="" width={24} height={24} style={{ width: 24, height: 24 }} />)}
          <span>OM Store · omdot.fun</span>
        </div>
      </div>
    </div>,
    { ...size, fonts: f, headers: { "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600" } },
  );
}
