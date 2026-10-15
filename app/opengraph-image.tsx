import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const alt         = "OMdotfun — prediction markets & token launchpad";
export const size        = { width: 1200, height: 630 };
export const contentType = "image/png";

const ORANGE = "#f97316";

async function loadFonts() {
  const dir = path.join(process.cwd(), "assets", "fonts");
  try {
    const [sb, eb] = await Promise.all(["Inter-SemiBold.otf", "Inter-ExtraBold.otf"].map((f) => readFile(path.join(dir, f))));
    return [
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


export default async function OgImage() {
  const [brand, fonts] = await Promise.all([brandLogo(), loadFonts()]);

  return new ImageResponse(
    <div
      style={{
        width: "100%", height: "100%", display: "flex", position: "relative", alignItems: "center",
        background: "linear-gradient(135deg, #0d0d10 0%, #141012 55%, #1a0f08 100%)",
        fontFamily: "Inter, sans-serif", color: "#fff", overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", left: -120, top: -160, width: 640, height: 640, borderRadius: 640, background: "radial-gradient(circle, rgba(249,115,22,0.24) 0%, rgba(249,115,22,0) 70%)", display: "flex" }} />
      <div style={{ position: "absolute", right: -100, bottom: -180, width: 620, height: 620, borderRadius: 620, background: "radial-gradient(circle, rgba(249,115,22,0.18) 0%, rgba(249,115,22,0) 70%)", display: "flex" }} />


      <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "0 0 0 84px" }}>
        <div style={{ display: "flex", alignItems: "center", fontSize: 34, fontWeight: 800, color: "#fff" }}>
          omdot.fun
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 26, fontSize: 92, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2 }}>
          <span>Predict.</span>
          <span style={{ color: ORANGE }}>Launch. Trade.</span>
        </div>
      </div>

      <div style={{ display: "flex", width: 400, alignItems: "center", justifyContent: "center", marginRight: 60 }}>
        {brand && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand} alt="" width={330} height={330} style={{ width: 330, height: 330 }} />
        )}
      </div>
    </div>,
    { ...size, fonts },
  );
}
