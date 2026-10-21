import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createAdminClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/social/posts";

export const alt = "Post on OMdotfun";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 300;

async function loadFonts() {
  const dir = path.join(process.cwd(), "assets", "fonts");
  try {
    const [r, eb] = await Promise.all(["Inter-Regular.otf", "Inter-ExtraBold.otf"].map((f) => readFile(path.join(dir, f))));
    return [
      { name: "Inter", data: r, weight: 400 as const, style: "normal" as const },
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

export default async function OgImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let name = "OMdotfun", text = "", avatar: string | null = null, image: string | null = null;
  try {
    if (UUID_RE.test(id)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const admin = createAdminClient() as any;
      const { data: p } = await admin.from("posts").select("body, images, author, hidden").eq("id", id).maybeSingle();
      if (p && !p.hidden) {
        text = String(p.body ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
        image = p.images?.[0] ?? null;
        const { data: w } = await admin.from("wallets").select("username, avatar_src").eq("wallet_address", p.author).maybeSingle();
        name = w?.username ?? `${String(p.author).slice(0, 4)}…${String(p.author).slice(-4)}`;
        avatar = w?.avatar_src ?? null;
      }
    }
  } catch { /* carte générique */ }
  const [fonts, logo] = await Promise.all([loadFonts(), brandLogo()]);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0b0b11", color: "#fff", fontFamily: "Inter" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64, width: image ? 640 : 1200 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} width={72} height={72} style={{ borderRadius: 36, objectFit: "cover", marginRight: 20 }} alt="" />
            ) : (
              <div style={{ width: 72, height: 72, borderRadius: 36, background: "#f97316", marginRight: 20 }} />
            )}
            <div style={{ fontSize: 40, fontWeight: 800 }}>{name}</div>
          </div>
          <div style={{ fontSize: text.length > 140 ? 38 : 50, lineHeight: 1.25, display: "flex" }}>{text || "OMdotfun"}</div>
          <div style={{ display: "flex", alignItems: "center", fontSize: 30, fontWeight: 800, color: "#f97316" }}>
            {logo && /* eslint-disable-next-line @next/next/no-img-element */ <img src={logo} width={48} height={48} style={{ marginRight: 14 }} alt="" />}
            omdot.fun
          </div>
        </div>
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} width={560} height={630} style={{ objectFit: "cover" }} alt="" />
        )}
      </div>
    ),
    { ...size, fonts },
  );
}
