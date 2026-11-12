/**
 * GET /api/og/box?week=YYYY-MM-DD
 * Carte PNG (1200×630) du gain de la box de la semaine, pour le partage (X, fil OM).
 */
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createAdminClient } from "@/lib/supabase/server";
import { getProfiles } from "@/lib/profiles";
import { PRIZE_SOL } from "@/lib/weekly-box";

let fontsP: Promise<{ name: string; data: Buffer; weight: 400 | 700; style: "normal" }[]> | null = null;
function fonts() {
  fontsP ??= Promise.all(([["Regular", 400], ["Bold", 700]] as const).map(async ([f, weight]) => ({
    name: "Inter", weight, style: "normal" as const,
    data: await readFile(path.join(process.cwd(), "assets/fonts", `Inter-${f}.otf`)),
  })));
  return fontsP;
}
async function dataUrl(file: string): Promise<string | null> {
  try { return `data:image/png;base64,${(await readFile(path.join(process.cwd(), "public", file))).toString("base64")}`; } catch { return null; }
}

export async function GET(req: Request) {
  const week = new URL(req.url).searchParams.get("week") ?? "";
  let name = "OMdotfun";
  let prize = PRIZE_SOL;
  if (/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    try {
       
      const admin = createAdminClient() as any;
      const { data } = await admin.from("weekly_box_weeks").select("winner, prize_sol").eq("week_start", week).maybeSingle();
      if (data?.winner) {
        const p = (await getProfiles(admin, [data.winner])).get(data.winner);
        name = p?.name ?? `${data.winner.slice(0, 4)}...${data.winner.slice(-4)}`;
        prize = Number(data.prize_sol) || PRIZE_SOL;
      }
    } catch { /* carte générique */ }
  }
  const [sol, logo] = await Promise.all([dataUrl("solana.png"), dataUrl("omdot-icon.png")]);

  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: 64, fontFamily: "Inter", color: "#fff", background: "linear-gradient(135deg, #ff9a5c 0%, #f26a1b 55%, #d9520c 100%)" }}>
        <div style={{ display: "flex", fontSize: 36, fontWeight: 700, opacity: 0.92 }}>Weekly box winner</div>
        <div style={{ display: "flex", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {sol && <img src={sol} alt="" width={150} height={150} style={{ borderRadius: 150 }} />}
          <div style={{ display: "flex", marginLeft: 34, fontSize: 168, fontWeight: 700, letterSpacing: -6 }}>{`${prize} SOL`}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", fontSize: 38, fontWeight: 700 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo && <img src={logo} alt="" width={64} height={64} style={{ marginRight: 18 }} />}
          {`${name} on omdot.fun`}
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: await fonts() },
  );
}
