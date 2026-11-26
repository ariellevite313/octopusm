"use client";

/**
 * Booster un token (n'importe lequel du Terminal) dans « Tokens en tendance » du fil : 100 000 OMERO pour 24 h,
 * payé en Omero uniquement. Ouverte depuis la colonne du fil ou depuis le Terminal (token déjà rempli).
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/providers/auth-provider";
import { Mirage } from "@/components/shared/mirage";
import { CHAINS } from "@/lib/terminal";
import { TOKEN_BOOST_COST_OMERO, TOKEN_BOOST_HOURS, validTokenAddress } from "@/lib/token-boost";

export const FEED_TOKENS_REFRESH = "om-feed-tokens-refresh";
const int = (n: number) => Math.round(n).toLocaleString("en-US");

export function BoostTokenSheet({ chain: chain0 = "solana", mint: mint0 = "", symbol, onClose }: { chain?: string; mint?: string; symbol?: string; onClose: () => void }) {
  const { tr } = useT();
  const { isAuthenticated } = useAuth();
  const [chain, setChain] = useState(chain0);
  const [mint, setMint] = useState(mint0);
  const [bal, setBal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetch("/api/wallet/summary", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => setBal(j?.omero?.balance ?? null)).catch(() => {});
  }, [isAuthenticated]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);

  const ok = validTokenAddress(chain, mint.trim());
  const short = bal != null && bal < TOKEN_BOOST_COST_OMERO;

  async function boost() {
    if (!isAuthenticated) { window.dispatchEvent(new CustomEvent("open-wallet-connect")); return; }
    setBusy(true);
    const r = await fetch("/api/tokens/boost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chain, mint: mint.trim() }) }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setBusy(false);
    if (!r?.ok) { toast.error(tr(j?.error ?? "Could not boost right now")); return; }
    toast.success(tr("{symbol} is boosted for {h} h", { symbol: `$${j.symbol}`, h: String(TOKEN_BOOST_HOURS) }));
    window.dispatchEvent(new Event(FEED_TOKENS_REFRESH));
    onClose();
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/60 backdrop-blur-[2px] md:items-center" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" className="scrollbar-none max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-[28px] border-t border-border bg-background px-5 pb-8 pt-3 md:rounded-[28px] md:border">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[19px] font-bold">{symbol ? tr("Boost {symbol}", { symbol: `$${symbol}` }) : tr("Boost a token")}</span>
          <button onClick={onClose} aria-label={tr("Close")} className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><X className="size-5" /></button>
        </div>
        {!mint0 && (
          <div className="space-y-3">
            <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">{tr("Network")}</span>
              <select value={chain} onChange={(e) => setChain(e.target.value)} className="h-12 w-full rounded-2xl bg-muted/60 px-4 text-[15px] font-semibold outline-none">
                {CHAINS.filter((c) => c.ready).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
            <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">{tr("Contract address")}</span>
              <input value={mint} onChange={(e) => setMint(e.target.value)} placeholder={chain === "solana" ? "So111…" : "0x…"} spellCheck={false}
                className="h-12 w-full rounded-2xl bg-muted/60 px-4 font-mono text-[14px] outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-foreground/15" /></label>
          </div>
        )}
        <div className="mt-4 divide-y divide-border">
          <div className="flex items-center justify-between py-3 text-[15px]"><span className="text-muted-foreground">{tr("Shown in Trending tokens")}</span><span className="num font-semibold">{TOKEN_BOOST_HOURS} h</span></div>
          <div className="flex items-center justify-between py-3 text-[15px]"><span className="text-muted-foreground">{tr("Price")}</span><span className="num flex items-center gap-1.5 font-semibold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/octo-coin.png" alt="" className="size-4 rounded-full" />{int(TOKEN_BOOST_COST_OMERO)} OMERO</span></div>
          {bal != null && <div className="flex items-center justify-between py-3 text-[15px]"><span className="text-muted-foreground">{tr("Your balance")}</span><span className={`num font-semibold ${short ? "text-down" : ""}`}>{int(bal)} OMERO</span></div>}
        </div>
        <button onClick={boost} disabled={busy || !ok || short} className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[16px] font-bold text-background disabled:opacity-40">
          {busy && <Mirage className="size-4" />}{short ? tr("Not enough Omero") : tr("Boost for {amount} OMERO", { amount: int(TOKEN_BOOST_COST_OMERO) })}
        </button>
      </div>
    </div>,
    document.body,
  );
}
