"use client";

/** Badge Aido sur le profil, et pour le propriétaire du profil : relier / retirer son compte Aido (signature MetaMask). */
import { useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { AIDO_URL, aidoLinkMessage } from "@/lib/aido-link";

type Eth = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

export function AidoBadge({ wallet, aido }: { wallet: string; aido: string | null }) {
  const { tr } = useT();
  const { walletAddress } = useAuth();
  const [linked, setLinked] = useState(aido);
  const [busy, setBusy] = useState(false);
  const mine = !!walletAddress && (wallet.startsWith("0x") ? walletAddress.toLowerCase() === wallet.toLowerCase() : walletAddress === wallet);

  async function link() {
    const eth = (window as unknown as { ethereum?: Eth }).ethereum;
    if (!eth) { toast.error(tr("Open this page in a browser with MetaMask to sign with your Aido wallet")); return; }
    setBusy(true);
    try {
      const [addr] = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const message = aidoLinkMessage(walletAddress!, addr, new Date().toISOString());
      const hex = `0x${Array.from(new TextEncoder().encode(message)).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
      const signature = (await eth.request({ method: "personal_sign", params: [hex, addr] })) as string;
      const r = await fetch("/api/aido-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, signature }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not link");
      setLinked(j.aido_address);
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
      <a href={AIDO_URL} target="_blank" rel="noopener noreferrer" title={linked}
        className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-[12px] font-bold text-foreground">
        <Link2 className="size-3.5" />Aido {linked.slice(0, 6)}...{linked.slice(-4)}
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
