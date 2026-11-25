"use client";

/**
 * Studio : fabriquer des images Omero dans le navigateur (aucun envoi, aucun coût).
 * - Photo de profil : Omero sur la couleur de ton choix, en rond.
 * - Mème : légende en haut et en bas.
 * - Idées : des pistes à copier pour une IA d'images (bannières, stickers, scènes).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { T } from "@/lib/i18n-mark";

const SRC = "/octo-coin.png";
const COLORS = ["#d10a12", "#f26a1b", "#f5c518", "#22a559", "#1d6bff", "#8a3ffc", "#ec4899", "#111111", "#ffffff"];
const SIZE = 1024;

/** Remplace le rouge du fond par la couleur choisie (le pelage orange reste intact). */
function recolor(ctx: CanvasRenderingContext2D, hex: string) {
  const img = ctx.getImageData(0, 0, SIZE, SIZE), d = img.data;
  const R = parseInt(hex.slice(1, 3), 16), G = parseInt(hex.slice(3, 5), 16), B = parseInt(hex.slice(5, 7), 16);
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    // Rouge franc : r élevé, g et b faibles. Plus c'est « rouge pur », plus on remplace.
    const redness = Math.min(1, Math.max(0, (r - Math.max(g, b) * 2.2 - 40) / 90));
    if (redness > 0) {
      const k = Math.min(1, redness * 1.15);
      d[i] = r + (R - r) * k; d[i + 1] = g + (G - g) * k; d[i + 2] = b + (B - b) * k;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function useOmero() {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => { const i = new Image(); i.onload = () => setImg(i); i.src = SRC; }, []);
  return img;
}

function drawBase(c: HTMLCanvasElement, img: HTMLImageElement, color: string) {
  c.width = SIZE; c.height = SIZE;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  if (color.toLowerCase() !== "#d10a12") recolor(ctx, color);
  return ctx;
}

function caption(ctx: CanvasRenderingContext2D, text: string, y: number, base: "top" | "bottom") {
  if (!text.trim()) return;
  const t = text.toUpperCase();
  let size = 120;
  ctx.font = `900 ${size}px Impact, "Arial Black", sans-serif`;
  while (ctx.measureText(t).width > SIZE - 80 && size > 40) { size -= 6; ctx.font = `900 ${size}px Impact, "Arial Black", sans-serif`; }
  ctx.textAlign = "center"; ctx.textBaseline = base; ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(8, size / 9); ctx.strokeStyle = "#000"; ctx.fillStyle = "#fff";
  ctx.strokeText(t, SIZE / 2, y); ctx.fillText(t, SIZE / 2, y);
}

function save(c: HTMLCanvasElement, name: string) {
  c.toBlob((b) => {
    if (!b) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, "image/png");
}

function Swatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const { tr } = useT();
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={tr("Background color")}>
      {COLORS.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={c} onClick={() => onChange(c)}
          className={`flex size-9 items-center justify-center rounded-full border-2 ${value === c ? "border-foreground" : "border-border"}`} style={{ background: c }}>
          {value === c && <Check className="size-4" style={{ color: c === "#ffffff" || c === "#f5c518" ? "#000" : "#fff" }} />}
        </button>
      ))}
    </div>
  );
}

function ProfileMaker({ img }: { img: HTMLImageElement | null }) {
  const { tr } = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState(COLORS[1]);
  const [round, setRound] = useState(true);
  useEffect(() => { if (ref.current && img) drawBase(ref.current, img, color); }, [img, color]);
  return (
    <section className="rounded-[28px] border border-border bg-card p-5">
      <h2 className="text-[18px] font-bold">{tr("Omero profile photo")}</h2>
      <p className="mt-1 text-[14px] text-muted-foreground">{tr("Pick a background color, then download it and use it as your photo.")}</p>
      <div className="mt-4 flex justify-center"><canvas ref={ref} className={`size-56 bg-muted ${round ? "rounded-full" : "rounded-3xl"}`} /></div>
      <div className="mt-4 space-y-3">
        <Swatches value={color} onChange={setColor} />
        <label className="flex items-center gap-2 text-[14px] font-semibold"><input type="checkbox" checked={round} onChange={(e) => setRound(e.target.checked)} className="size-4" />{tr("Round preview")}</label>
        <button onClick={() => ref.current && save(ref.current, "omero-profile.png")} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[15px] font-bold text-background"><Download className="size-4" />{tr("Download")}</button>
      </div>
    </section>
  );
}

function MemeMaker({ img }: { img: HTMLImageElement | null }) {
  const { tr } = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [top, setTop] = useState("");
  const [bottom, setBottom] = useState("");
  const draw = useCallback(() => {
    if (!ref.current || !img) return;
    const ctx = drawBase(ref.current, img, color);
    caption(ctx, top, 30, "top"); caption(ctx, bottom, SIZE - 30, "bottom");
  }, [img, color, top, bottom]);
  useEffect(draw, [draw]);
  const inp = "h-11 w-full rounded-xl bg-muted px-3 text-[15px] text-foreground outline-none";
  return (
    <section className="rounded-[28px] border border-border bg-card p-5">
      <h2 className="text-[18px] font-bold">{tr("Omero meme")}</h2>
      <p className="mt-1 text-[14px] text-muted-foreground">{tr("Write a caption at the top and the bottom, then download and post it.")}</p>
      <div className="mt-4 flex justify-center"><canvas ref={ref} className="aspect-square w-full max-w-[320px] rounded-2xl bg-muted" /></div>
      <div className="mt-4 space-y-3">
        <input className={inp} value={top} onChange={(e) => setTop(e.target.value.slice(0, 60))} placeholder={tr("Top text")} />
        <input className={inp} value={bottom} onChange={(e) => setBottom(e.target.value.slice(0, 60))} placeholder={tr("Bottom text")} />
        <Swatches value={color} onChange={setColor} />
        <button onClick={() => ref.current && save(ref.current, "omero-meme.png")} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[15px] font-bold text-background"><Download className="size-4" />{tr("Download")}</button>
      </div>
    </section>
  );
}

const IDEAS: { title: string; prompt: string }[] = [
  { title: T("Omero trader"), prompt: T("A cute 3D shiba mascot named Omero, orange fur and cream face, closed smiling eyes, sitting at a trading desk with green candlestick charts on screens, soft studio light, clean background.") },
  { title: T("Omero banner"), prompt: T("Wide banner 1500x500, the 3D shiba mascot Omero on the right looking happy, a bold orange and black gradient on the left with empty space for a title, subtle chart lines.") },
  { title: T("Omero with bonbons"), prompt: T("The 3D shiba mascot Omero holding a white cat-ear lollipop and an orange cat-ear lollipop with a dollar sign, playful, soft shadows, plain light background.") },
  { title: T("Omero sticker pack"), prompt: T("Sticker sheet of the 3D shiba mascot Omero with 6 expressions: happy, shocked, sleeping, rich, sad, laughing. White outline, transparent-style background.") },
  { title: T("Omero astronaut"), prompt: T("The 3D shiba mascot Omero as an astronaut floating near a green candle chart rocket, deep blue space, bright orange accents.") },
  { title: T("Omero for your token"), prompt: T("The 3D shiba mascot Omero wearing a cap with my token name, standing next to a big coin, bold flat color background in my brand color.") },
];

function Ideas() {
  const { tr } = useT();
  const [done, setDone] = useState<number | null>(null);
  async function copy(i: number, text: string) {
    try { await navigator.clipboard.writeText(text); setDone(i); setTimeout(() => setDone(null), 1500); }
    catch { toast.error(tr("Could not copy")); }
  }
  return (
    <section className="rounded-[28px] border border-border bg-card p-5 lg:col-span-2">
      <h2 className="text-[18px] font-bold">{tr("Ideas for your images")}</h2>
      <p className="mt-1 text-[14px] text-muted-foreground">{tr("Copy a prompt into your favorite image AI, then post the result on the feed.")}</p>
      <div className="mt-3 grid gap-2.5 lg:grid-cols-2">
        {IDEAS.map((x, i) => (
          <div key={x.title} className="rounded-2xl border border-border bg-muted/40 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[15px] font-bold">{tr(x.title)}</p>
              <button onClick={() => copy(i, x.prompt)} className="flex shrink-0 items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-[12px] font-bold">
                {done === i ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{done === i ? tr("Copied") : tr("Copy")}
              </button>
            </div>
            <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">{tr(x.prompt)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Studio() {
  const { tr } = useT();
  const img = useOmero();
  return (
    <div className="space-y-4">
      <div className="px-1">
        <h1 className="text-[28px] font-bold tracking-tight">{tr("Studio")}</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">{tr("Make Omero memes, profile photos and banners. Everything happens in your browser.")}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ProfileMaker img={img} />
        <MemeMaker img={img} />
        <Ideas />
      </div>
    </div>
  );
}
