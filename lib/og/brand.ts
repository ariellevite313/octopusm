import { readFile } from "node:fs/promises";
import path from "node:path";

export const SITE_URL = "https://omdot.fun";
export const ORANGE   = "#f97316";

let fontsP: Promise<{ name: string; data: Buffer; weight: 400 | 600 | 800; style: "normal" }[] | undefined> | null = null;

/** Inter (OFL) loaded from assets/fonts — satori has no bold otherwise. */
export function ogFonts() {
  fontsP ??= (async () => {
    try {
      const dir = path.join(process.cwd(), "assets", "fonts");
      const [r, sb, eb] = await Promise.all(
        ["Inter-Regular.otf", "Inter-SemiBold.otf", "Inter-ExtraBold.otf"].map((f) => readFile(path.join(dir, f))),
      );
      return [
        { name: "Inter", data: r,  weight: 400 as const, style: "normal" as const },
        { name: "Inter", data: sb, weight: 600 as const, style: "normal" as const },
        { name: "Inter", data: eb, weight: 800 as const, style: "normal" as const },
      ];
    } catch { return undefined; }
  })();
  return fontsP;
}

/** Brand mark as a data URI (no network fetch while rendering). */
export async function brandLogo(): Promise<string | null> {
  try {
    const buf = await readFile(path.join(process.cwd(), "public", "omdot-icon.png"));
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch { return null; }
}

/** Scattered small brand marks (x, y, size, rotation, opacity) for dark backgrounds. */
export const BG_MARKS: { x: number; y: number; s: number; r: number; o: number }[] = [
  { x: 24,  y: 150, s: 46, r: -14, o: 0.08 }, { x: 250, y: 30,  s: 36, r: 12,  o: 0.07 },
  { x: 470, y: 120, s: 52, r: 20,  o: 0.06 }, { x: 120, y: 330, s: 40, r: 18,  o: 0.06 },
  { x: 400, y: 300, s: 44, r: -18, o: 0.06 }, { x: 30,  y: 520, s: 52, r: 10,  o: 0.07 },
  { x: 300, y: 540, s: 40, r: -20, o: 0.07 }, { x: 500, y: 470, s: 36, r: 14,  o: 0.06 },
];

export function absUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  return u.startsWith("http") ? u : `${SITE_URL}${u.startsWith("/") ? "" : "/"}${u}`;
}
