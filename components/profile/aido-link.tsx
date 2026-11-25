"use client";

/** Badge Aido sur le profil, et pour le propriétaire du profil : relier / retirer son compte Aido (signature MetaMask). */
import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { aidoLinkMessage, aidoProfileUrl } from "@/lib/aido-link";
import { prefetchWalletConnect, signWithWalletConnect, toHex, WC_PROJECT_ID } from "@/lib/wallet/walletconnect";
import { Mirage } from "@/components/shared/mirage";

type Eth = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

export function AidoBadge({ wallet, aido, handle }: { wallet: string; aido: string | null; handle: string | null }) {
  const { tr } = useT();
  const { walletAddress } = useAuth();
  const [linked, setLinked] = useState(aido);
  const [name, setName] = useState(handle);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [mAddr, setMAddr] = useState("");
  const [mSig, setMSig] = useState("");
  const [issued, setIssued] = useState(() => new Date().toISOString());
  useEffect(() => { if (walletAddress) prefetchWalletConnect(); }, [walletAddress]);
  const mine = !!walletAddress && (wallet.startsWith("0x") ? walletAddress.toLowerCase() === wallet.toLowerCase() : walletAddress === wallet);

  async function link() {
    const eth = (window as unknown as { ethereum?: Eth }).ethereum;
    setBusy(true);
    try {
      const issued = new Date().toISOString();
      let message: string;
      let signature: string;
      if (eth) {
        // Extension ou navigateur de wallet : signature directe
        const [addr] = (await eth.request({ method: "eth_requestAccounts" })) as string[];
        message = aidoLinkMessage(walletAddress!, addr, issued);
        signature = (await eth.request({ method: "personal_sign", params: [toHex(message), addr] })) as string;
      } else {
        // Pas de wallet dans ce navigateur (utilisateurs Solana, mobile) : WalletConnect, on signe dans l'app Aido
        const r = await signWithWalletConnect((addr) => aidoLinkMessage(walletAddress!, addr, issued));
        message = aidoLinkMessage(walletAddress!, r.address, issued);
        signature = r.signature;
      }
      await send(message, signature);
    } catch (e) {
      const m = (e as Error).message ?? "";
      toast.error(tr(m.slice(0, 120) || "Could not link"));
      // WalletConnect absent ou refusé : on propose la signature manuelle
      if (!eth && (!WC_PROJECT_ID || /not configured|reject|denied|cancel|timeout|connect/i.test(m))) { setIssued(new Date().toISOString()); setManual(true); }
    }
    setBusy(false);
  }
  async function send(message: string, signature: string) {
    const r = await fetch("/api/aido-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, signature }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? "Could not link");
    setLinked(j.aido_address);
    setName(j.aido_handle ?? null);
    setManual(false);
    toast.success(tr("Aido account linked"));
  }
  const manualMsg = /^0x[0-9a-fA-F]{40}$/.test(mAddr.trim()) && walletAddress ? aidoLinkMessage(walletAddress, mAddr.trim(), issued) : "";
  async function submitManual() {
    setBusy(true);
    try { await send(manualMsg, mSig.trim()); } catch (e) { toast.error(tr((e as Error).message?.slice(0, 120) || "Could not link")); }
    setBusy(false);
  }
  async function unlink() {
    setBusy(true);
    await fetch("/api/aido-link", { method: "DELETE" }).catch(() => {});
    setLinked(null);
    setBusy(false);
  }

  if (linked) return (
    <span className="inline-flex items-center gap-2">
      <a href={aidoProfileUrl(name)} target="_blank" rel="noopener noreferrer" title={name ? `Aido @${name}` : "Aido"} aria-label={name ? `Aido @${name}` : "Aido"}
        className="inline-flex items-center transition-opacity hover:opacity-70">
        {/* Logo Aido blanc sans fond : inversé en noir en mode clair */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/aido-logo.png" alt="Aido" className="size-6 invert dark:invert-0" />
      </a>
      {mine && <button onClick={unlink} disabled={busy} className="text-[12px] font-semibold text-muted-foreground underline">{tr("Unlink")}</button>}
    </span>
  );
  if (!mine) return null;
  return (
    <div className="flex flex-col items-start gap-2">
      <span className="inline-flex flex-wrap items-center gap-2">
        <button onClick={link} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-[12px] font-bold text-foreground disabled:opacity-50">
          {busy ? <Mirage className="size-3.5" /> : <Link2 className="size-3.5" />}{tr("Link my Aido account")}
        </button>
        <button onClick={() => { setIssued(new Date().toISOString()); setManual((v) => !v); }} className="text-[12px] font-semibold text-muted-foreground underline">{tr("Sign manually")}</button>
      </span>
      {manual && (
        <div className="w-full max-w-sm space-y-2 rounded-2xl border border-border bg-card p-3">
          <p className="text-[12px] text-muted-foreground">{tr("1. Enter your Aido wallet address. 2. Sign the message below with that wallet (personal_sign). 3. Paste the signature.")}</p>
          <input value={mAddr} onChange={(e) => setMAddr(e.target.value)} placeholder="0x…" className="h-10 w-full rounded-xl bg-muted px-3 text-[13px] text-foreground outline-none" />
          {manualMsg && (
            <textarea readOnly value={manualMsg} onFocus={(e) => e.currentTarget.select()} className="h-24 w-full rounded-xl bg-muted p-3 font-mono text-[11px] text-foreground outline-none" />
          )}
          <input value={mSig} onChange={(e) => setMSig(e.target.value)} placeholder={tr("Signature (0x…)")} className="h-10 w-full rounded-xl bg-muted px-3 text-[13px] text-foreground outline-none" />
          <button onClick={submitManual} disabled={busy || !manualMsg || !mSig.trim()} className="h-10 w-full rounded-xl bg-foreground text-[13px] font-bold text-background disabled:opacity-50">{tr("Link")}</button>
          <p className="text-[11px] text-muted-foreground">{tr("The message is valid for 10 minutes.")}</p>
        </div>
      )}
    </div>
  );
}
