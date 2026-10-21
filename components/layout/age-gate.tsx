"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useT, Rich } from "@/lib/i18n";

const KEY = "om_age_ok_v1";

/** Entry notice: 18+ only and no-liability clause. Shown once per browser. */
export function AgeGate() {
  const { tr } = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) !== "1") setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  // Legal pages stay readable before accepting.
  const exempt = pathname === "/policy" || pathname === "/privacy";
  const show = open && !exempt;

  useEffect(() => {
    if (!show) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [show]);

  if (!show) return null;

  function accept() {
    try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
    setOpen(false);
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-background p-6 shadow-xl">
        <h2 className="text-lg font-bold text-foreground">{tr("Notice before you enter")}</h2>
        <p className="text-sm leading-relaxed text-foreground">
          {tr("OMdotfun is not intended for anyone under 18. By entering, you confirm that you are at least 18 years old (or of legal age in your country) and that prediction markets and token trading are allowed where you live.")}
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {tr("OMdotfun is a platform for peer-to-peer markets and tokens created by users. We give no financial advice and do not guarantee any result or profit. Crypto assets are volatile: you can lose everything. You act at your own risk and are solely responsible for your decisions, your wallet and your taxes. OMdotfun is not liable for any loss or damage.")}
        </p>
        <p className="text-xs text-muted-foreground">
          <Rich linkClass="underline underline-offset-2 text-foreground">{tr("Read the [rules](/policy) and the [privacy policy](/privacy).")}</Rich>
        </p>
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => { window.location.href = "https://www.google.com"; }}
            className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            {tr("Leave")}
          </button>
          <button
            onClick={accept}
            className="flex-1 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background hover:opacity-90"
          >
            {tr("I am 18+ and I accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
