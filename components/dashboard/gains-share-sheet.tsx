"use client";

/**
 * GainsShareSheet — carte partageable des gains créateur réalisés sur OMdot
 * (total des claims + courbe cumulée), avec cadre orange animé.
 * Actions : partager (image), copier le lien, copier l'image.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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

function _unusedFmtDate(ms: number, span: number) {
  const d = new Date(ms);
  return span <= 2 * 24 * 3600_000
    ? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function GainsShareSheet({
  open, onClose, walletAddress, currency, totalClaimed,
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

  const base = typeof window !== "undefined" ? window.location.origin : "";
  const imgUrl = `${base}/api/og/gains/${encodeURIComponent(walletAddress)}?p=${period}`;
  const link = `${base}/share/gains/${encodeURIComponent(walletAddress)}?p=${period}${refCode ? `&ref=${encodeURIComponent(refCode)}` : ""}`;

  // Image PNG générée par le serveur : identique partout (aperçu du lien, copie, partage)
  const [blob, setBlob] = useState<Blob | null>(null);
  const [imgReady, setImgReady] = useState(false);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setBlob(null); setImgReady(false);
    fetch(imgUrl).then(r => (r.ok ? r.blob() : null)).then(b => { if (alive) setBlob(b); }).catch(() => {});
    return () => { alive = false; };
  }, [open, imgUrl]);

  function downloadImage(b: Blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = "omdot-gains.png";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  async function copyImage() {
    setBusy("image");
    const getBlob = blob ? Promise.resolve(blob) : fetch(imgUrl).then(r => r.blob());
    try {
      // Le Promise directement dans ClipboardItem : requis par Safari / iPhone
      await navigator.clipboard.write([new ClipboardItem({ "image/png": getBlob })]);
      toast.success("Image copied");
    } catch {
      // Navigateur sans copie d'image (navigateurs intégrés aux wallets…) : on enregistre l'image
      try {
        const b = await getBlob;
        const file = new File([b], "omdot-gains.png", { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
        else { downloadImage(b); toast.success("Image saved"); }
      } catch { toast.error("Could not copy the image"); }
    } finally { setBusy(null); }
  }

  async function share() {
    setBusy("share");
    const text = `+${fmt(totalClaimed, currency)} earned as a creator on OMdot`;
    try {
      const file = blob ? new File([blob], "omdot-gains.png", { type: "image/png" }) : null;
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: `${text} ${link}` });
      } else if (navigator.share) {
        await navigator.share({ text, url: link });   // l'aperçu du lien affiche la carte
      } else {
        await navigator.clipboard.writeText(`${text} ${link}`);
        toast.success("Link copied");
      }
    } catch { /* annulé */ } finally { setBusy(null); }
  }

  if (!open) return null;

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
        {/* ── Carte : image générée par le serveur (la même que celle partagée) ── */}
        <div className="relative overflow-hidden rounded-[24px] p-[2px] shadow-[0_20px_60px_-20px_rgba(255,122,26,0.55)]">
          <div className="gains-frame absolute inset-[-60%]" />
          <div className="relative aspect-[1200/630] overflow-hidden rounded-[22px] bg-white">
            {!imgReady && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="size-6 animate-spin text-[#ff7a1a]" /></div>}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={imgUrl} src={imgUrl} alt="Creator gains" onLoad={() => setImgReady(true)} className={`size-full object-cover transition-opacity ${imgReady ? "opacity-100" : "opacity-0"}`} />
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
