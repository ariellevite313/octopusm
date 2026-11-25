"use client";

/** Fiche d'une app Discover : en-tête, bouton Ouvrir, paiement en token, images, à propos, notes et avis, apps similaires. */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, MoreVertical, Share2, Star } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { shortAddress } from "@/lib/format";
import { APP_CATEGORY_LABEL } from "@/lib/discover";
import { ShareSheet } from "@/components/shared/share-sheet";
import { Mirage } from "@/components/shared/mirage";
import { AppIcon, Rating, compact, visit, type AppCard } from "@/components/discover/app-bits";

type Detail = {
  app: AppCard & { description: string; screenshots: string[]; paymentNote: string; owner: { wallet: string; name: string | null } };
  bars: { star: number; count: number; pct: number }[];
  reviews: { wallet: string; name: string | null; avatar: string | null; rating: number; body: string | null; at: string }[];
  mine: { rating: number; body: string | null } | null;
  isOwner: boolean;
  similar: AppCard[];
};

function Stars({ n, size = "size-4" }: { n: number; size?: string }) {
  return <span className="inline-flex gap-0.5">{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`${size} ${i <= Math.round(n) ? "fill-foreground text-foreground" : "text-muted-foreground/40"}`} />)}</span>;
}

export function AppDetail({ id }: { id: string }) {
  const { tr } = useT();
  const { isAuthenticated } = useAuth();
  const [d, setD] = useState<Detail | null>(null);
  const [missing, setMissing] = useState(false);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [shot, setShot] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [share, setShare] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/discover/apps/${id}`, { cache: "no-store" }).then(async (r) => {
      if (!r.ok) { setMissing(true); return; }
      const j = (await r.json()) as Detail;
      setD(j);
      if (j.mine) { setRating(j.mine.rating); setBody(j.mine.body ?? ""); }
    }).catch(() => setMissing(true));
  }, [id]);
  useEffect(load, [load]);

  async function sendReview() {
    if (!isAuthenticated) { window.dispatchEvent(new CustomEvent("open-wallet-connect")); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/discover/apps/${id}/reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating, body }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Could not save your review");
      toast.success(tr("Thanks for your review"));
      load();
    } catch (e) { toast.error(tr((e as Error).message)); }
    setBusy(false);
  }

  if (missing) return <p className="py-20 text-center text-muted-foreground">{tr("This project is not available.")}</p>;
  if (!d) return <div className="flex justify-center py-20"><Mirage className="size-5 text-muted-foreground" /></div>;
  const a = d.app;
  const cat = tr(APP_CATEGORY_LABEL[a.category as keyof typeof APP_CATEGORY_LABEL] ?? "Other");
  const images = a.screenshots.length ? a.screenshots : a.banner ? [a.banner] : [];

  return (
    <div>
      {/* Image du projet en haut, qui s'estompe vers la page (comme un store) */}
      <div className="relative">
        <div className="relative h-[180px] overflow-hidden sm:h-[240px] lg:h-[300px] lg:rounded-b-[32px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {a.banner && <img src={a.banner} alt="" className="size-full object-cover opacity-70" />}
          <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/50 to-background" />
        </div>
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-2 pt-2 sm:px-4">
          <Link href="/discover" aria-label={tr("Back")} className="flex size-11 items-center justify-center rounded-full bg-background/60 backdrop-blur hover:bg-background/80"><ArrowLeft className="size-5" /></Link>
          <div className="relative">
            <button onClick={() => setMenu((v) => !v)} aria-label={tr("More")} className="flex size-11 items-center justify-center rounded-full bg-background/60 backdrop-blur hover:bg-background/80"><MoreVertical className="size-5" /></button>
            {menu && (
              <div className="absolute right-0 top-12 z-20 w-48 overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
                <button onClick={() => { setMenu(false); setShare(true); }} className="flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] hover:bg-muted"><Share2 className="size-4" />{tr("Share")}</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="relative -mt-24 space-y-7 px-4 sm:-mt-28 sm:px-6 lg:-mt-32 lg:px-8">
      {/* En-tête */}
      <div className="lg:grid lg:grid-cols-[1fr_340px] lg:items-end lg:gap-8">
        <div>
          <Link href={`/profile/${a.owner.wallet}`} className="text-[14px] font-semibold text-primary">{a.owner.name ?? shortAddress(a.owner.wallet)}</Link>
          <div className="mt-1 flex items-start gap-4">
            <h1 className="min-w-0 flex-1 text-[32px] font-bold leading-[1.1] tracking-tight text-foreground sm:text-[40px] lg:text-[48px]">{a.name}</h1>
            <AppIcon app={a} className="size-20 sm:size-24 lg:hidden" />
          </div>
          <p className="mt-1 text-[15px] text-muted-foreground">{a.tagline}</p>
          <div className="mt-4 flex divide-x divide-border text-center">
            <div className="flex-1 px-2 sm:flex-none sm:pr-6 sm:text-left"><p className="num flex items-center justify-center gap-1 text-[16px] font-bold sm:justify-start">{a.ratings ? a.rating.toFixed(1) : "-"}<Star className="size-3.5 fill-current" /></p><p className="text-[12px] text-muted-foreground">{tr("{n} reviews", { n: compact(a.ratings) })}</p></div>
            <div className="flex-1 px-2 sm:flex-none sm:px-6 sm:text-left"><p className="num text-[16px] font-bold">{compact(a.visits)}</p><p className="text-[12px] text-muted-foreground">{tr("Visits")}</p></div>
            <div className="flex-1 px-2 sm:flex-none sm:px-6 sm:text-left"><p className="text-[16px] font-bold">{cat}</p><p className="text-[12px] text-muted-foreground">{tr("Category")}</p></div>
            <Link href={`/launchpad/${a.token.slug}`} className="flex-1 px-2 sm:flex-none sm:pl-6 sm:text-left"><p className="text-[16px] font-bold">${a.token.ticker}</p><p className="text-[12px] text-muted-foreground">{tr("Its token")}</p></Link>
          </div>
        </div>
        <div className="mt-5 lg:mt-0">
          <AppIcon app={a} className="mb-4 hidden size-28 lg:block" />
          <a href={a.siteUrl} target="_blank" rel="noopener noreferrer" onClick={() => visit(a.id)} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[16px] font-bold text-background transition-opacity hover:opacity-90">{tr("Open website")}</a>
          <p className="mt-1.5 text-center text-[12px] text-muted-foreground lg:text-left">{tr("Opens the project website")}</p>
        </div>
      </div>

      {/* Paiement dans le token : visible par tous */}
      <div className="flex items-start gap-3 rounded-[22px] border border-border bg-card p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {a.token.logo ? <img src={a.token.logo} alt="" className="size-11 shrink-0 rounded-full object-cover" /> : <span className="size-11 shrink-0 rounded-full bg-muted" />}
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold">{tr("Payments on this website use ${t}", { t: a.token.ticker })}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{a.paymentNote}</p>
        </div>
        <Link href={`/launchpad/${a.token.slug}`} className="shrink-0 rounded-full bg-muted px-3.5 py-2 text-[13px] font-bold">{tr("Buy")}</Link>
      </div>

      {/* Images */}
      {images.length > 0 && (
        <div className="-mx-4 flex snap-x scroll-pl-4 gap-3 overflow-x-auto scrollbar-none px-4 sm:-mx-6 sm:scroll-pl-6 sm:px-6 lg:mx-0 lg:px-0">
          {images.map((src) => (
            <button key={src} onClick={() => setShot(src)} className="h-[220px] shrink-0 snap-start overflow-hidden rounded-[18px] bg-muted sm:h-[280px] lg:h-[340px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-auto object-cover" />
            </button>
          ))}
        </div>
      )}

      <section>
        <h2 className="text-[19px] font-bold">{tr("About this project")}</h2>
        <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground">{a.description}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-xl border border-border px-3 py-1.5 text-[13px] font-semibold">{cat}</span>
          <span className="rounded-xl border border-border px-3 py-1.5 text-[13px] font-semibold">{a.token.chain === "arc" ? "Arc" : "Solana"}</span>
        </div>
      </section>

      {/* Notes et avis */}
      <section>
        <h2 className="text-[19px] font-bold">{tr("Ratings and reviews")}</h2>
        <div className="mt-3 flex items-center gap-5">
          <div className="text-center">
            <p className="num text-[52px] font-semibold leading-none">{a.ratings ? a.rating.toFixed(1) : "-"}</p>
            <Stars n={a.rating} size="size-3.5" />
            <p className="num mt-1 text-[12px] text-muted-foreground">{a.ratings}</p>
          </div>
          <div className="flex-1 space-y-1">
            {d.bars.map((b) => (
              <div key={b.star} className="flex items-center gap-2.5 text-[12px] text-muted-foreground">
                <span className="num w-2">{b.star}</span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-foreground" style={{ width: `${a.ratings ? b.pct : 0}%` }} /></span>
              </div>
            ))}
          </div>
        </div>

        {!d.isOwner && (
          <div className="mt-5 rounded-[22px] border border-border bg-card p-4">
            <p className="text-[15px] font-bold">{d.mine ? tr("Your review") : tr("Rate this project")}</p>
            <div className="mt-2 flex gap-1.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <button key={i} onClick={() => setRating(i)} aria-label={tr("{n} stars", { n: i })}><Star className={`size-8 ${i <= rating ? "fill-foreground text-foreground" : "text-muted-foreground/50"}`} /></button>
              ))}
            </div>
            <textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, 600))} rows={3} placeholder={tr("Describe your experience (optional)")}
              className="mt-3 w-full resize-none rounded-2xl bg-muted px-3.5 py-3 text-[15px] text-foreground outline-none" />
            <button onClick={sendReview} disabled={busy || rating === 0} className="mt-2 flex h-11 w-full items-center justify-center rounded-full bg-foreground text-[15px] font-bold text-background disabled:opacity-40">
              {busy ? <Mirage className="size-4" /> : d.mine ? tr("Update my review") : tr("Publish")}
            </button>
          </div>
        )}

        <div className="mt-4 divide-y divide-border">
          {d.reviews.length === 0 ? <p className="py-4 text-[14px] text-muted-foreground">{tr("No review yet.")}</p> : d.reviews.map((r) => (
            <div key={r.wallet} className="py-4">
              <div className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {r.avatar ? <img src={r.avatar} alt="" className="size-8 rounded-full object-cover" /> : <span className="flex size-8 items-center justify-center rounded-full bg-muted text-[13px] font-bold">{(r.name ?? r.wallet).slice(0, 1).toUpperCase()}</span>}
                <span className="text-[14px] font-semibold">{r.name ?? shortAddress(r.wallet)}</span>
              </div>
              <div className="mt-2 flex items-center gap-2"><Stars n={r.rating} size="size-3" /><span className="text-[12px] text-muted-foreground">{new Date(r.at).toLocaleDateString()}</span></div>
              <p className="mt-1.5 text-[14px] leading-relaxed text-foreground">{r.body}</p>
            </div>
          ))}
        </div>
      </section>

      {d.similar.length > 0 && (
        <section>
          <h2 className="text-[19px] font-bold">{tr("Similar projects")}</h2>
          <div className="-mx-4 mt-3 flex gap-3 overflow-x-auto scrollbar-none px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
            {d.similar.map((s) => (
              <Link key={s.id} href={`/discover/${s.id}`} className="w-[104px] shrink-0">
                <AppIcon app={s} className="size-[104px]" />
                <p className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-tight">{s.name}</p>
                <Rating value={s.rating} count={s.ratings} className="text-[12px] text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      )}

      </div>

      <ShareSheet open={share} onClose={() => setShare(false)} url={`/discover/${a.id}`} text={`${a.name}: ${a.tagline}. Paid in $${a.token.ticker} on OMdotfun Discover.`} images={a.banner ? [a.banner] : []} />

      {shot && (
        <button onClick={() => setShot(null)} aria-label={tr("Close")} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot} alt="" className="max-h-full max-w-full rounded-2xl object-contain" />
        </button>
      )}
    </div>
  );
}
