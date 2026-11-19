"use client";

/**
 * ShareSheet — bottom sheet de partage (marchés, tokens).
 * Carte aperçu (image générée par le serveur = celle des liens partagés),
 * gains de parrainage, puis actions : copier le lien, X, Telegram, Discord, copier l'image.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link2, Copy, Loader2, Users, Coins, Flame, MessageSquare, Share, Download } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { ComposeModal } from "@/components/social/compose-modal";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { Rich } from "@/lib/i18n";
import { T } from "@/lib/i18n-mark";

type Perk = { icon: "users" | "coins"; text: string };

export const MARKET_PERKS: Perk[] = [
  { icon: "users", text: T("<b>1%</b> of every prediction your invites place") },
  { icon: "coins", text: T("<b>200 OMERO</b> for each friend who joins with your link") },
  { icon: "coins", text: T("Post it on the feed: <b>200 OMERO</b> per friend who predicts, or a share of our fees on pools") },
];
export const POST_PERKS: Perk[] = [
  { icon: "coins", text: T("<b>200 OMERO</b> for each friend who joins with your link") },
  { icon: "users", text: T("<b>10%</b> of our fees on every buy your invites make") },
];
export const TOKEN_PERKS: Perk[] = [
  { icon: "coins", text: T("<b>200 OMERO</b> for each friend who joins with your link") },
  { icon: "users", text: T("<b>50 OMERO</b> welcome bonus for your friend") },
  { icon: "users", text: T("<b>10%</b> of our fees on every buy your invites make") },
];

const XIcon = () => (
  <svg viewBox="0 0 24 24" className="size-6 fill-current" aria-hidden>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);
const TgIcon = () => (
  <svg viewBox="0 0 24 24" className="size-6 fill-current" aria-hidden>
    <path d="M11.944 0A12 12 0 1 0 23.988 12 12 12 0 0 0 11.944 0zm4.962 8.224l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.334-.373-.12l-6.869 4.326-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.829.941z" />
  </svg>
);
const DiscordIcon = () => (
  <svg viewBox="0 0 24 24" className="size-6 fill-current" aria-hidden>
    <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.292a.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.1.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
);

const WaIcon = () => (
  <svg viewBox="0 0 24 24" className="size-6 fill-current" aria-hidden>
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.3-.4.8-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 2s.8 2.3 1 2.5c.1.2 1.6 2.5 4 3.5 1.5.6 2 .7 2.8.6.4-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.4-.3z" />
  </svg>
);
const FbIcon = () => (
  <svg viewBox="0 0 24 24" className="size-6 fill-current" aria-hidden>
    <path d="M13.5 22v-8.2h2.8l.4-3.2h-3.2V8.5c0-.9.3-1.6 1.6-1.6h1.7V4.1c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.4H7.3v3.2h2.8V22h3.4z" />
  </svg>
);

export function ShareSheet({
  open, onClose, images, text, perks = MARKET_PERKS, url, feed = true, portrait = false, fileName = "omdot-share.png",
}: {
  open: boolean;
  onClose: () => void;
  /** Cartes aperçu (chemins ou URLs). Plusieurs = carrousel. */
  images: string[];
  /** Texte accompagnant le partage (X, Telegram). */
  text: string;
  perks?: Perk[];
  /** Lien à partager (défaut : page courante). */
  url?: string;
  /** Affiche le bouton « Publier sur le fil » (faux pour le partage d'un post). */
  feed?: boolean;
  /** Cartes verticales (carte de gains 1080×1240) au lieu des aperçus 1200×630. */
  portrait?: boolean;
  /** Nom du fichier image enregistré ou partagé. */
  fileName?: string;
}) {
  const { tr } = useT();
  const [refCode, setRefCode] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [compose, setCompose] = useState<string | null>(null);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!open) return;
    setIdx(0);
    fetch("/api/drawer-stats")
      .then(r => (r.ok ? r.json() : null))
      .then((d: { referral_code?: string | null } | null) => setRefCode(d?.referral_code ?? null))
      .catch(() => {});
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;
  if (!open) {
    return compose !== null
      ? <ComposeModal initialBody={compose} onClose={() => setCompose(null)} onPosted={() => toast.success(tr("Posted to the feed"))} />
      : null;
  }

  const base = window.location.origin;
  const raw = new URL(url ?? window.location.href, base);
  raw.hash = "";
  if (refCode) raw.searchParams.set("ref", refCode);
  const link = raw.toString();
  const abs = (p: string) => (p.startsWith("http") ? p : `${base}${p}`);

  // Publier sur le fil OMdotfun : le lien (sans code de parrainage) devient une carte du marché
  const postToFeed = () => {
    if (!isAuthenticated) { onClose(); window.dispatchEvent(new CustomEvent("open-wallet-connect")); return; }
    const clean = new URL(url ?? window.location.href, base);
    clean.hash = ""; clean.search = "";
    setCompose(`${text}\n${clean.toString()}`);
    onClose();
  };
  const copyLink = () => navigator.clipboard.writeText(link).then(() => toast.success(tr("Link copied")));
  const shareX = () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`, "_blank", "noopener,noreferrer");
  const shareTg = () => window.open(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  const shareDiscord = () => navigator.clipboard.writeText(`${text} ${link}`).then(() => toast.success(tr("Link copied — paste it in Discord")));
  const shareWa = () => window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`, "_blank", "noopener,noreferrer");
  const shareFb = () => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`, "_blank", "noopener,noreferrer");
  const imageBlob = () => fetch(abs(images[idx] ?? images[0])).then(r => { if (!r.ok) throw new Error("img"); return r.blob(); });
  const saveBlob = (b: Blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b); a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  // Partage natif avec l'image (téléphone : Instagram, WhatsApp, X… avec la carte en pièce jointe)
  async function shareImage() {
    setBusy(true);
    try {
      const b = await imageBlob();
      const file = new File([b], fileName, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: `${text} ${link}` });
      else if (navigator.share) await navigator.share({ text, url: link });
      else { saveBlob(b); toast.success(tr("Image saved")); }
    } catch { /* annulé */ } finally { setBusy(false); }
  }
  async function downloadImage() {
    try { saveBlob(await imageBlob()); toast.success(tr("Image saved")); } catch { toast.error(tr("Could not copy the image")); }
  }

  async function copyImage() {
    setBusy(true);
    const src = abs(images[idx] ?? images[0]);
    const getBlob = fetch(src).then(r => { if (!r.ok) throw new Error("img"); return r.blob(); });
    try {
      // Le Promise directement dans ClipboardItem : requis par Safari / iPhone
      await navigator.clipboard.write([new ClipboardItem({ "image/png": getBlob })]);
      toast.success(tr("Image copied"));
    } catch {
      try {
        const b = await getBlob;
        const file = new File([b], fileName, { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
        else {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(b); a.download = fileName;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          toast.success(tr("Image saved"));
        }
      } catch { toast.error(tr("Could not copy the image")); }
    } finally { setBusy(false); }
  }

  const circle = "flex size-14 shrink-0 items-center justify-center rounded-full bg-black/[0.06] text-black transition-colors hover:bg-black/[0.1]";

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 backdrop-blur-[2px]" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" className="relative max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-white text-[#0b0b11] shadow-2xl">
        <button onClick={onClose} aria-label={tr("Close")} className="mx-auto flex h-7 w-full items-center justify-center">
          <span className="h-1.5 w-12 rounded-full bg-black/15" />
        </button>

        {/* ── Carrousel de cartes ─────────────────────────────────────── */}
        <div className={`${images.length ? "" : "hidden"} ${portrait ? "bg-[linear-gradient(180deg,rgba(0,0,0,0.06),rgba(0,0,0,0.01))]" : "bg-[linear-gradient(180deg,rgba(255,122,26,0.12),rgba(255,122,26,0.03))]"} py-5`}>
          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 [scrollbar-width:none]"
            onScroll={(e) => { const el = e.currentTarget; setIdx(Math.round(el.scrollLeft / (el.clientWidth * 0.9))); }}>
            {images.map((src) => (
              <div key={src} className={`relative ${portrait ? "mx-auto aspect-[1080/1240] w-[68%] max-w-[320px] rounded-[22px] bg-[#0b0b0f] shadow-[0_18px_44px_-18px_rgba(0,0,0,0.6)]" : `aspect-[1200/630] ${images.length > 1 ? "w-[90%]" : "w-full"} rounded-2xl bg-white shadow-[0_14px_40px_-16px_rgba(255,122,26,0.6)] ring-1 ring-black/5`} shrink-0 snap-center overflow-hidden`}>
                {!loaded[src] && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="size-6 animate-spin text-[#ff7a1a]" /></div>}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" onLoad={() => setLoaded(l => ({ ...l, [src]: true }))} onError={() => setLoaded(l => ({ ...l, [src]: true }))}
                  className={`size-full object-cover transition-opacity ${loaded[src] ? "opacity-100" : "opacity-0"}`} />
              </div>
            ))}
          </div>
          {images.length > 1 && (
            <div className="mt-3 flex justify-center gap-2">
              {images.map((s, i) => <span key={s} className={`size-2 rounded-full ${i === idx ? "bg-black" : "bg-black/20"}`} />)}
            </div>
          )}
        </div>

        {/* ── Gains de parrainage (aucun quand perks est vide) ─────────── */}
        {perks.length > 0 && <div className="px-6 pt-6">
          <Flame className="size-9 fill-[#ff7a1a] text-[#ff7a1a]" />
          <h2 className="mt-3 text-[28px] font-extrabold leading-[1.1] tracking-tight">
            {tr("Share & earn")}<br />{tr("when your friends trade")}
          </h2>
          <ul className="mt-5 divide-y divide-black/10">
            {perks.map((p, i) => (
              <li key={i} className="flex items-center gap-3 py-4 text-[16px] text-black/55 [&_b]:font-extrabold [&_b]:text-[#0b0b11]">
                {p.icon === "users" ? <Users className="size-6 shrink-0 text-black" strokeWidth={1.6} /> : <Coins className="size-6 shrink-0 text-black" strokeWidth={1.6} />}
                <span><Rich>{tr(p.text)}</Rich></span>
              </li>
            ))}
          </ul>
        </div>}

        {/* ── Actions ─────────────────────────────────────────────────── */}
        <div className="flex gap-3 overflow-x-auto px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-4 [scrollbar-width:none]">
          <button onClick={copyLink} className="flex h-14 shrink-0 items-center gap-3 rounded-full bg-black px-7 text-[17px] font-bold text-white">
            <Link2 className="size-5" />{tr("Copy link")}
          </button>
          {feed && <button onClick={postToFeed} className={circle} aria-label={tr("Post on the feed")} title={tr("Post on the feed")}><MessageSquare className="size-6" /></button>}
          <button onClick={shareX} className={circle} aria-label="X"><XIcon /></button>
          <button onClick={shareTg} className={circle} aria-label="Telegram"><TgIcon /></button>
          <button onClick={shareWa} className={circle} aria-label="WhatsApp"><WaIcon /></button>
          <button onClick={shareFb} className={circle} aria-label="Facebook"><FbIcon /></button>
          <button onClick={shareDiscord} className={circle} aria-label="Discord"><DiscordIcon /></button>
          {images.length > 0 && <button onClick={shareImage} disabled={busy} className={circle} aria-label={tr("Share image")} title={tr("Share image")}><Share className="size-6" /></button>}
          {images.length > 0 && <button onClick={downloadImage} className={circle} aria-label={tr("Download image")} title={tr("Download image")}><Download className="size-6" /></button>}
          {images.length > 0 && <button onClick={copyImage} disabled={busy} className={circle} aria-label={tr("Copy image")}>
            {busy ? <Loader2 className="size-6 animate-spin" /> : <Copy className="size-6" />}
          </button>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
