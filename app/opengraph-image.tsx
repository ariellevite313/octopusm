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

const MARKS: { x: number; y: number; s: number; r: number; o: number }[] = [
  { x: 40, y: 70, s: 46, r: -14, o: 0.07 }, { x: 420, y: 20, s: 34, r: 12, o: 0.06 },
  { x: 700, y: 60, s: 56, r: 20, o: 0.06 }, { x: 1000, y: 30, s: 40, r: -10, o: 0.07 },
  { x: 1110, y: 200, s: 52, r: 16, o: 0.06 }, { x: 60, y: 520, s: 52, r: 10, o: 0.06 },
  { x: 420, y: 550, s: 40, r: -20, o: 0.06 }, { x: 760, y: 540, s: 58, r: 14, o: 0.05 },
  { x: 1090, y: 520, s: 44, r: 22, o: 0.06 },
];

const CHIPS = ["Prediction markets", "Token launchpad", "Solana · Arc"];

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

      {brand && MARKS.map((m, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={brand} alt="" width={m.s} height={m.s}
          style={{ position: "absolute", left: m.x, top: m.y, width: m.s, height: m.s, opacity: m.o, transform: `rotate(${m.r}deg)` }} />
      ))}

      <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "0 0 0 84px" }}>
        <div style={{ display: "flex", alignItems: "center", fontSize: 34, fontWeight: 800, color: "#fff" }}>
          OM<span style={{ color: ORANGE }}>dot</span>fun
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 26, fontSize: 92, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2 }}>
          <span>Predict.</span>
          <span style={{ color: ORANGE }}>Launch. Trade.</span>
        </div>
        <div style={{ display: "flex", marginTop: 26, fontSize: 30, fontWeight: 600, color: "#a1a1aa" }}>
          Bet on real-world events and launch tokens in minutes.
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 34 }}>
          {CHIPS.map((c) => (
            <div key={c} style={{ display: "flex", padding: "10px 20px", borderRadius: 999, border: "2px solid rgba(249,115,22,0.55)", fontSize: 24, fontWeight: 600, color: "#fdba74" }}>{c}</div>
          ))}
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
