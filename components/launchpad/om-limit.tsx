"use client";

/** Page d'un token lancé sur OM (Solana) : ordres limités et TWAP, exécutés par Jupiter, comme dans le Terminal. */
import { useEffect, useState } from "react";
import { ChevronDown, Crosshair } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/providers/auth-provider";
import { LimitSheet } from "@/components/terminal/limit-sheet";

export function OmLimit({ mint, ticker, mcap }: { mint: string; ticker: string; mcap: number | null }) {
  const { tr } = useT();
  const { walletAddress, walletType, isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [wait, setWait] = useState(false);
  const sol = isAuthenticated && !!walletAddress && !walletAddress.startsWith("0x") && !!walletType;
  // Après la connexion du wallet, le formulaire s'ouvre tout seul
  useEffect(() => { if (wait && sol) { setWait(false); setOpen(true); } }, [wait, sol]);

  function toggle() {
    if (open) { setOpen(false); return; }
    if (sol) setOpen(true);
    else { setWait(true); window.dispatchEvent(new CustomEvent("open-wallet-connect")); }
  }

  return (
    <div className="rounded-2xl border border-border">
      <button type="button" onClick={toggle} className="flex w-full items-center justify-between px-4 py-3.5 text-left">
        <span className="flex items-center gap-2 text-[15px] font-bold text-foreground"><Crosshair className="size-[18px]" />{tr("Limit and TWAP")}</span>
        <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && sol && walletType && (
        <div className="border-t border-border p-4"><LimitSheet mint={mint} symbol={ticker} mcap={mcap} walletType={walletType} /></div>
      )}
    </div>
  );
}
