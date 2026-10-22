"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** Photo de profil : un clic l'ouvre en plein écran. */
export function AvatarZoom({ src, alt, children }: { src: string; alt: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={alt} className="shrink-0 rounded-full">{children}</button>
      {open && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-6" onClick={() => setOpen(false)}>
          <button type="button" aria-label="Close" className="absolute left-4 top-4 flex size-10 items-center justify-center rounded-full bg-white/10 text-white"><X className="size-5" /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-h-[80vh] max-w-full rounded-full object-cover shadow-2xl" style={{ aspectRatio: "1 / 1" }} />
        </div>,
        document.body,
      )}
    </>
  );
}
