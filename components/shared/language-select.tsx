"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { LANGS, useT } from "@/lib/i18n";

function List({ onPick, onClose, className, style }: { onPick: () => void; onClose: () => void; className: string; style?: React.CSSProperties }) {
  const { lang, setLang } = useT();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", down);
    window.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); window.removeEventListener("keydown", key); };
  }, [onClose]);
  return (
    <div ref={ref} role="listbox" className={className} style={style}>
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          role="option"
          aria-selected={lang === l.code}
          onClick={() => { setLang(l.code); onPick(); }}
          className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-[14px] transition-colors hover:bg-muted ${lang === l.code ? "font-semibold text-foreground" : "text-muted-foreground"}`}
        >
          <span>{l.label}</span>
          {lang === l.code && <Check className="size-4 text-primary" />}
        </button>
      ))}
    </div>
  );
}

/** Sélecteur de langue « EN ▾ » (en-tête). */
export function LanguageSelect({ className = "" }: { className?: string }) {
  const { lang } = useT();
  const [open, setOpen] = useState(false);
  const cur = LANGS.find((l) => l.code === lang)!;
  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        aria-label="Language"
        aria-haspopup="listbox"
        aria-expanded={open}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 items-center gap-1 rounded-full bg-muted px-3 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted/70"
      >
        {cur.short}
        <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <List
          onPick={() => setOpen(false)}
          onClose={() => setOpen(false)}
          className="absolute right-0 top-full z-[100] mt-2 w-44 rounded-2xl border border-border bg-card p-1.5 shadow-xl"
        />
      )}
    </div>
  );
}

/** Version icône pour la barre latérale (ordinateur) : ouvre la liste à côté de la barre. */
export function LanguageSelectRail() {
  const { lang } = useT();
  const [open, setOpen] = useState(false);
  const cur = LANGS.find((l) => l.code === lang)!;
  return (
    <>
      <button
        type="button"
        title="Language"
        aria-label="Language"
        aria-haspopup="listbox"
        aria-expanded={open}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-10 items-center gap-1 rounded-full px-3 text-[13px] font-semibold transition-colors ${open ? "bg-muted/70 text-foreground" : "bg-muted text-foreground hover:bg-muted/70"}`}
      >
        {cur.short}
        <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && createPortal(
        <List
          onPick={() => setOpen(false)}
          onClose={() => setOpen(false)}
          className="fixed bottom-4 left-[84px] z-[100] w-48 rounded-2xl border border-border bg-card p-1.5 shadow-2xl"
        />,
        document.body,
      )}
    </>
  );
}
