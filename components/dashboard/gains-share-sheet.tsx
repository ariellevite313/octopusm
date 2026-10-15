"use client";

/**
 * GainsShareSheet — carte partageable des gains créateur réalisés sur OMdot
 * (total des claims + courbe cumulée), avec cadre orange animé.
 * Actions : partager (image), copier le lien, copier l'image.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { X, Share, Link2, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Period = "24h" | "7d" | "30d" | "all";
const PERIODS: { id: Period; label: string; ms: number | null }[] = [
  { id: "24h", label: "24h", ms: 24 * 3600_000 },
  { id: "7d",  label: "7d",  ms: 7 * 24 * 3600_000 },
  { id: "30d", label: "30d", ms: 30 * 24 * 3600_000 },
  { id: "all", label: "All", ms: null },
];

function fmt(n: number, cur: string) {
  if (n === 0) return `0 ${cur}`;
  if (n >= 1000) return `${n.toFixed(2)} ${cur}`;
  if (n >= 1) return `${n.toFixed(4)} ${cur}`;
  return `${n.toFixed(6)} ${cur}`;
}

function fmtDate(ms: number, span: number) {
  const d = new Date(ms);
  return span <= 2 * 24 * 3600_000
    ? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function GainsShareSheet({
  open, onClose, name, avatarSrc, walletAddress, currency, totalClaimed, history,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  avatarSrc: string | null;
  walletAddress: string;
  currency: string;
  totalClaimed: number;
  history: { t: string; amount: number }[];
}) {
  const [period, setPeriod] = useState<Period>("30d");
  const [refCode, setRefCode] = useState<string | null>(null);
  const [busy, setBusy] = useState<"share" | "image" | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/drawer-stats")
      .then(r => (r.ok ? r.json() : null))
      .then((d: { referral_code?: string | null } | null) => setRefCode(d?.referral_code ?? null))
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Série cumulée sur la période choisie
  const chart = useMemo(() => {
    const now = Date.now();
    const pts = history.map(h => ({ t: new Date(h.t).getTime(), a: h.amount })).filter(p => !Number.isNaN(p.t));
    const p = PERIODS.find(x => x.id === period)!;
    const start = p.ms ? now - p.ms : (pts[0]?.t ?? now - 24 * 3600_000);
    let base = 0;
    for (const x of pts) if (x.t < start) base += x.a;
    const series: { t: number; v: number }[] = [{ t: start, v: base }];
    let v = base;
    for (const x of pts) if (x.t >= start) { series.push({ t: x.t, v }); v += x.a; series.push({ t: x.t, v }); }
    series.push({ t: now, v });
    return { series, start, end: now, gain: v - base };
  }, [history, period]);

  const link = typeof window !== "undefined"
    ? (refCode ? `${window.location.origin}/?ref=${refCode}` : `${window.location.origin}/profile/${walletAddress}`)
    : "";

  async function renderImage(): Promise<Blob | null> {
    if (!cardRef.current) return null;
    const { toBlob } = await import("html-to-image");
    return toBlob(cardRef.current, { pixelRatio: 2, cacheBust: true, backgroundColor: "#ffffff" });
  }

  async function copyImage() {
    setBusy("image");
    try {
      const blob = await renderImage();
      if (!blob) throw new Error();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Image copied");
    } catch {
      toast.error("Could not copy the image");
    } finally { setBusy(null); }
  }

  async function share() {
    setBusy("share");
    try {
      const blob = await renderImage();
      const file = blob ? new File([blob], "omdot-gains.png", { type: "image/png" }) : null;
      const text = `+${fmt(totalClaimed, currency)} earned as a creator on OMdot`;
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text, url: link });
      } else if (navigator.share) {
        await navigator.share({ text, url: link });
      } else {
        await navigator.clipboard.writeText(`${text} ${link}`);
        toast.success("Link copied");
      }
    } catch { /* annulé */ } finally { setBusy(null); }
  }

  if (!open) return null;

  // ── Géométrie du graphe ──
  const W = 320, H = 170;
  const { series, start, end } = chart;
  const vals = series.map(s => s.v);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const x = (t: number) => ((t - start) / Math.max(end - start, 1)) * W;
  const y = (v: number) => max === min ? H * 0.55 : 8 + (1 - (v - min) / span) * (H - 16);
  const line = series.map((s, i) => `${i ? "L" : "M"}${x(s.t).toFixed(1)} ${y(s.v).toFixed(1)}`).join(" ");
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const mid = start + (end - start) / 2;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-white text-[#0b0b11]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_at_top,rgba(255,122,26,0.16),transparent_70%)]" />

      <div className="relative flex items-center justify-between px-4 pt-[max(16px,env(safe-area-inset-top))]">
        <span className="w-10" />
        <p className="text-[19px] font-bold tracking-tight">Creator gains</p>
        <button onClick={onClose} className="flex size-10 items-center justify-center rounded-full text-black/50 hover:text-black" aria-label="Close">
          <X className="size-6" />
        </button>
      </div>

      <div className="relative mx-auto mt-6 w-full max-w-md px-3">
        {/* ── Carte (exportée en image) ── */}
        <div ref={cardRef} className="relative overflow-hidden rounded-[30px] p-[2px] shadow-[0_20px_60px_-20px_rgba(255,122,26,0.55)]">
          {/* Cadre animé */}
          <div className="gains-frame absolute inset-[-60%]" />

          <div className="relative overflow-hidden rounded-[28px] bg-white">
            <div className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-[#ff7a1a]/10 blur-3xl" />

            <div className="relative p-5 pb-3">
              <div className="flex items-center gap-3.5">
                {avatarSrc ? (
                  <Image src={avatarSrc} alt="" width={56} height={56} className="size-14 rounded-full object-cover ring-2 ring-[#ff7a1a]/60" unoptimized />
                ) : (
                  <div className="flex size-14 items-center justify-center rounded-full bg-[#ff7a1a] text-lg font-bold text-white">
                    {name.replace(/^@/, "").slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-[22px] font-bold tracking-tight">{name}</p>
                  <span className="mt-1 inline-block rounded-md bg-[#ff7a1a]/12 px-2 py-0.5 text-[13px] font-semibold text-[#e8650c]">Creator fees</span>
                </div>
              </div>

              <p className="num mt-6 text-[44px] font-bold leading-none tracking-tight">
                {fmt(totalClaimed, "").trim()}<span className="ml-2 text-xl text-black/45">{currency}</span>
              </p>
              <p className="num mt-2 text-[17px]">
                <span className="font-semibold text-[#22c55e]">+{fmt(chart.gain, currency)}</span>
                <span className="ml-2 text-black/45">{PERIODS.find(p => p.id === period)!.label === "All" ? "all time" : PERIODS.find(p => p.id === period)!.label}</span>
              </p>

              {/* Graphe */}
              <div className="relative mt-5">
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[170px] w-[calc(100%-52px)] overflow-visible">
                  <defs>
                    <linearGradient id="gains-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ff7a1a" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="#ff7a1a" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={area} fill="url(#gains-area)" />
                  <path d={line} fill="none" stroke="#ff7a1a" strokeWidth={2.25} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                  <circle cx={x(series[series.length - 1].t)} cy={y(series[series.length - 1].v)} r={4} fill="#ff7a1a" className="gains-dot" />
                </svg>
                <span className="num absolute right-0 top-0 text-[11px] text-black/40">{fmt(max, "").trim()}</span>
                <span className="num absolute bottom-0 right-0 text-[11px] text-black/40">{fmt(min, "").trim()}</span>
              </div>
              <div className="mt-2 flex w-[calc(100%-52px)] justify-between text-[11px] text-black/40">
                <span>{fmtDate(start, end - start)}</span>
                <span>{fmtDate(mid, end - start)}</span>
                <span>{fmtDate(end, end - start)}</span>
              </div>
            </div>

            {/* Bandeau */}
            <div className="relative flex items-center justify-between gap-3 bg-gradient-to-r from-[#ff7a1a] via-[#ff8a2e] to-[#ff5a00] px-5 py-4 text-white">
              <div className="flex items-center gap-2">
                <img src="/card-logo.png" alt="" className="size-9 rounded-full" />
                <span className="text-[22px] font-black tracking-tight">omdot.fun</span>
              </div>
              <p className="text-right text-[12px] leading-tight text-white/85">
                {refCode ? <>Join with code<br /><span className="text-[16px] font-bold text-white">{refCode}</span></> : <>Launch your token<br /><span className="text-[15px] font-bold text-white">in seconds</span></>}
              </p>
            </div>
          </div>
        </div>

        {/* Période */}
        <div className="mt-6 flex justify-center">
          <div className="flex gap-1 rounded-full bg-black/[0.05] p-1 ring-1 ring-black/5">
            {PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`rounded-full px-4 py-2 text-[15px] font-semibold transition-colors ${period === p.id ? "bg-white text-black shadow-sm" : "text-black/45 hover:text-black"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 grid grid-cols-3 gap-2 pb-[max(24px,env(safe-area-inset-bottom))]">
          <ShareAction label="Share" onClick={share} busy={busy === "share"}><Share className="size-6" /></ShareAction>
          <ShareAction label="Copy link" onClick={() => navigator.clipboard.writeText(link).then(() => toast.success("Link copied"))}><Link2 className="size-6" /></ShareAction>
          <ShareAction label="Copy image" onClick={copyImage} busy={busy === "image"}><Copy className="size-6" /></ShareAction>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ShareAction({ label, onClick, busy, children }: { label: string; onClick: () => void; busy?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={busy} className="group flex flex-col items-center gap-2 disabled:opacity-60">
      <span className="flex size-16 items-center justify-center rounded-full bg-black/[0.05] ring-1 ring-black/5 transition-colors group-hover:bg-black/[0.09]">
        {busy ? <Loader2 className="size-6 animate-spin" /> : children}
      </span>
      <span className="text-[15px] font-medium">{label}</span>
    </button>
  );
}
