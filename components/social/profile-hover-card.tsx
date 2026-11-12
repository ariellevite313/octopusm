"use client";

/**
 * Carte de profil au survol (ordinateur), comme sur X : photo, nom, @, « te suit », bio, communauté,
 * abonnements / abonnés, abonnés en commun, bouton Suivre. Rien sur téléphone (pas de survol).
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { shortAddress } from "@/lib/format";
import { compactCount } from "@/lib/social/tips";

type Card = {
  wallet: string; username: string | null; name: string | null; avatar: string | null; bio: string | null;
  followers: number; following: number; is_following: boolean; follows_you: boolean; mine: boolean;
  mutual: { name: string | null; avatar: string | null }[]; mutual_count: number;
  community: { slug: string; name: string; logo_src: string | null } | null;
};

const cache = new Map<string, Card>();

export function ProfileHoverCard({ wallet, children, className = "" }: { wallet: string; children: React.ReactNode; className?: string }) {
  const { tr } = useT();
  const { isAuthenticated } = useAuth();
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; up: boolean } | null>(null);
  const [card, setCard] = useState<Card | null>(cache.get(wallet) ?? null);
  const openT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => { if (openT.current) clearTimeout(openT.current); if (closeT.current) clearTimeout(closeT.current); }, []);

  function enter() {
    if (typeof window === "undefined" || !window.matchMedia("(hover: hover) and (min-width: 1024px)").matches) return;
    if (closeT.current) clearTimeout(closeT.current);
    if (pos) return;
    openT.current = setTimeout(() => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const up = r.bottom + 330 > window.innerHeight;
      setPos({ x: Math.min(Math.max(12, r.left), window.innerWidth - 312), y: up ? r.top - 8 : r.bottom + 8, up });
      if (!cache.has(wallet)) {
        fetch(`/api/users/card?wallet=${encodeURIComponent(wallet)}`).then((x) => (x.ok ? x.json() : null)).then((j) => { if (j) { cache.set(wallet, j); setCard(j); } }).catch(() => {});
      }
    }, 450);
  }
  function leave() {
    if (openT.current) clearTimeout(openT.current);
    closeT.current = setTimeout(() => setPos(null), 220);
  }
  async function follow(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (!isAuthenticated) { window.dispatchEvent(new CustomEvent("open-wallet-connect")); return; }
    if (!card) return;
    setBusy(true);
    const r = await fetch("/api/follow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet: card.wallet }) });
    const j = await r.json().catch(() => null);
    setBusy(false);
    if (r.ok && j) { const next = { ...card, is_following: j.is_following, followers: j.followers ?? card.followers }; cache.set(wallet, next); setCard(next); }
  }

  const name = card?.name ?? shortAddress(wallet);
  return (
    <span ref={ref} onMouseEnter={enter} onMouseLeave={leave} className={className}>
      {children}
      {pos && typeof document !== "undefined" && createPortal(
        <div
          onMouseEnter={() => closeT.current && clearTimeout(closeT.current)}
          onMouseLeave={leave}
          style={{ left: pos.x, top: pos.y, transform: pos.up ? "translateY(-100%)" : undefined }}
          className="fixed z-[90] w-[300px] rounded-2xl border border-border bg-background p-4 shadow-2xl"
        >
          {!card ? <div className="h-32 animate-pulse rounded-xl bg-muted/60" /> : (
            <>
              <div className="flex items-start justify-between">
                <Link href={`/profile/${card.wallet}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {card.avatar ? <img src={card.avatar} alt="" className="size-16 rounded-full object-cover" />
                    : <span className="flex size-16 items-center justify-center rounded-full bg-muted text-xl font-bold">{name[0]?.toUpperCase()}</span>}
                </Link>
                {!card.mine && (
                  <button onClick={follow} disabled={busy} className={`rounded-full px-4 py-1.5 text-[14px] font-bold disabled:opacity-50 ${card.is_following ? "border border-border text-foreground" : "bg-foreground text-background"}`}>
                    {card.is_following ? tr("Following") : tr("Follow")}
                  </button>
                )}
              </div>
              <Link href={`/profile/${card.wallet}`} className="mt-2 block truncate text-[17px] font-extrabold text-foreground hover:underline">{name}</Link>
              <p className="flex items-center gap-2 text-[14px] text-muted-foreground">
                <span className="truncate">{card.username ? `@${card.username}` : shortAddress(card.wallet)}</span>
                {card.follows_you && <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold">{tr("Follows you")}</span>}
              </p>
              {card.bio && <p className="mt-2 whitespace-pre-line text-[14px] text-foreground">{card.bio}</p>}
              {card.community && (
                <Link href={`/c/${card.community.slug}`} className="mt-2 flex items-center gap-2 text-[13px] font-semibold text-foreground hover:underline">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {card.community.logo_src && <img src={card.community.logo_src} alt="" className="size-5 rounded-md object-cover" />}
                  <span className="truncate">{card.community.name}</span>
                </Link>
              )}
              <p className="mt-2 text-[14px]">
                <span className="font-bold text-foreground">{compactCount(card.following)}</span> <span className="text-muted-foreground">{tr("Following")}</span>
                <span className="ml-4 font-bold text-foreground">{compactCount(card.followers)}</span> <span className="text-muted-foreground">{tr("Followers")}</span>
              </p>
              {card.mutual_count > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="flex -space-x-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {card.mutual.filter((m) => m.avatar).map((m, i) => <img key={i} src={m.avatar!} alt="" className="size-5 rounded-full border border-background object-cover" />)}
                  </span>
                  <span className="line-clamp-2 text-[12px] text-muted-foreground">
                    {card.mutual_count > card.mutual.length
                      ? tr("Followed by {names} and {n} others you follow", { names: card.mutual.map((m) => m.name).filter(Boolean).slice(0, 2).join(", "), n: card.mutual_count - Math.min(2, card.mutual.length) })
                      : tr("Followed by {names}", { names: card.mutual.map((m) => m.name).filter(Boolean).join(", ") })}
                  </span>
                </div>
              )}
            </>
          )}
        </div>,
        document.body,
      )}
    </span>
  );
}
