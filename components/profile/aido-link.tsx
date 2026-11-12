"use client";

/** Badge Aido sur le profil, et pour le propriétaire du profil : relier / retirer son compte Aido (signature MetaMask). */
import { useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { aidoLinkMessage, aidoProfileUrl } from "@/lib/aido-link";
import { signWithWalletConnect, toHex } from "@/lib/wallet/walletconnect";

type Eth = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

export function AidoBadge({ wallet, aido, handle }: { wallet: string; aido: string | null; handle: string | null }) {
  const { tr } = useT();
  const { walletAddress } = useAuth();
  const [linked, setLinked] = useState(aido);
  const [name, setName] = useState(handle);
  const [busy, setBusy] = useState(false);
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
      const r = await fetch("/api/aido-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, signature }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not link");
      setLinked(j.aido_address);
      setName(j.aido_handle ?? null);
      toast.success(tr("Aido account linked"));
    } catch (e) { toast.error(tr((e as Error).message?.slice(0, 120) || "Could not link")); }
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
    <button onClick={link} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-[12px] font-bold text-foreground disabled:opacity-50">
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}{tr("Link my Aido account")}
    </button>
  );
}
