"use client";

/** NFT (Solana uniquement) : mes NFT, et les collections populaires avec un lien pour les acheter sur Magic Eden ou Tensor. */
import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { Mirage } from "@/components/shared/mirage";
import { SolanaMark } from "@/components/shared/solana-mark";
import { useT } from "@/lib/i18n";

type Mine = { mint: string; name: string; image: string | null; collection: string | null; compressed: boolean };
type Col = { symbol: string; name: string; image: string | null; floorSol: number | null; volumeSol: number | null };

const sol = (n: number | null) => (n == null ? "-" : n >= 100 ? n.toFixed(0) : n.toFixed(2));

export function NftView() {
  const { tr } = useT();
  const { walletAddress, isAuthenticated } = useAuth();
  const [tab, setTab] = useState<"mine" | "hot">("hot");
  const [mine, setMine] = useState<Mine[] | null>(null);
  const [mineErr, setMineErr] = useState<string | null>(null);
  const [hot, setHot] = useState<Col[] | null>(null);
  const solanaWallet = isAuthenticated && !!walletAddress && !walletAddress.startsWith("0x");

  useEffect(() => { fetch("/api/nft/trending").then((r) => r.json()).then((j) => setHot(j.items ?? [])).catch(() => setHot([])); }, []);
  useEffect(() => {
    if (tab !== "mine" || !solanaWallet || mine) return;
    fetch("/api/nft/mine", { cache: "no-store" }).then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) setMineErr(j.error ?? "Could not read your NFTs right now"); setMine(j.items ?? []); })
      .catch(() => { setMineErr("Could not read your NFTs right now"); setMine([]); });
  }, [tab, solanaWallet, mine]);

  const spin = <div className="flex justify-center py-12"><Mirage className="size-5 text-muted-foreground" /></div>;
  return (
    <div className="space-y-4">
      <div className="px-1">
        <h1 className="flex items-center gap-2 text-[28px] font-bold tracking-tight">{tr("NFT")}<SolanaMark className="size-6" /></h1>
        <p className="mt-1 text-[15px] text-muted-foreground">{tr("NFTs on Solana: see yours and discover popular collections.")}</p>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1">
        {(["hot", "mine"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-xl py-2.5 text-sm font-bold ${tab === k ? "bg-background text-foreground" : "text-muted-foreground"}`}>{k === "hot" ? tr("Popular") : tr("My NFTs")}</button>
        ))}
      </div>

      {tab === "hot" && (hot === null ? spin : hot.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">{tr("Collections could not be loaded right now.")}</p> : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {hot.map((c) => (
            <a key={c.symbol} href={`https://magiceden.io/marketplace/${encodeURIComponent(c.symbol)}`} target="_blank" rel="noopener noreferrer" className="overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:bg-muted/40">
              <div className="aspect-square bg-muted">{/* eslint-disable-next-line @next/next/no-img-element */}{c.image && <img src={c.image} alt="" loading="lazy" className="size-full object-cover" />}</div>
              <div className="p-3">
                <p className="truncate text-[14px] font-bold">{c.name}</p>
                <p className="num mt-0.5 text-[12px] text-muted-foreground">{tr("Floor")} {sol(c.floorSol)} SOL</p>
              </div>
            </a>
          ))}
        </div>
      ))}

      {tab === "mine" && (!solanaWallet ? (
        <div className="rounded-[28px] border border-border bg-card p-6 text-center">
          <p className="text-[15px] text-muted-foreground">{tr("Connect a Solana wallet to see your NFTs.")}</p>
          <button onClick={() => window.dispatchEvent(new CustomEvent("open-wallet-connect"))} className="btn-primary mt-4 h-12 rounded-2xl px-6 text-[15px]">{tr("Connect Wallet")}</button>
        </div>
      ) : mine === null ? spin : mine.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{mineErr ? tr(mineErr) : tr("No NFT in this wallet.")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {mine.map((n) => (
            <a key={n.mint} href={`https://magiceden.io/item-details/${n.mint}`} target="_blank" rel="noopener noreferrer" className="group overflow-hidden rounded-2xl border border-border bg-card">
              <div className="aspect-square bg-muted">{/* eslint-disable-next-line @next/next/no-img-element */}{n.image && <img src={n.image} alt="" loading="lazy" className="size-full object-cover" />}</div>
              <p className="flex items-center justify-between gap-1 p-2.5 text-[13px] font-semibold"><span className="truncate">{n.name}</span><ExternalLink className="size-3.5 shrink-0 text-muted-foreground" /></p>
            </a>
          ))}
        </div>
      ))}
    </div>
  );
}
