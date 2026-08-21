"use client";

import { useState, useRef, useEffect } from "react";
import { Share2, Copy, Check, X } from "lucide-react";

interface Props {
  name:    string;
  ticker:  string;
}

export function TokenShareButton({ name, ticker }: Props) {
  const [open,   setOpen]   = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const url  = typeof window !== "undefined" ? window.location.href : "";
  const text = `🚀 Check out $${ticker} — ${name} on OMdotfun Launchpad!`;

  function copyLink() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => { setCopied(false); setOpen(false); }, 1500);
    });
  }

  function shareX() {
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      "_blank", "noopener,noreferrer"
    );
    setOpen(false);
  }

  function shareTelegram() {
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
      "_blank", "noopener,noreferrer"
    );
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Share2 className="size-3.5" />
        Share
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-44 rounded-xl border border-border bg-background shadow-xl overflow-hidden">
          {/* X / Twitter */}
          <button
            onClick={shareX}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
          >
            <svg viewBox="0 0 24 24" className="size-4 fill-current shrink-0" aria-hidden>
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Share on X
          </button>

          {/* Telegram */}
          <button
            onClick={shareTelegram}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
          >
            <svg viewBox="0 0 24 24" className="size-4 fill-current shrink-0" aria-hidden>
              <path d="M11.944 0A12 12 0 1 0 23.988 12 12 12 0 0 0 11.944 0zm4.962 8.224l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.334-.373-.12l-6.869 4.326-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.829.941z" />
            </svg>
            Telegram
          </button>

          {/* Copy link */}
          <button
            onClick={copyLink}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-muted transition-colors border-t border-border"
          >
            {copied
              ? <Check className="size-4 text-emerald-500 shrink-0" />
              : <Copy className="size-4 shrink-0" />}
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
      )}
    </div>
  );
}
