"use client";

/**
 * Discover : la vitrine des sites construits avec un token OM, sur le modèle d'un store d'apps.
 * Grande image à la une, recherche, catégories, recommandations (fiches boostées en Omero) et nouveautés.
 * Le bouton « Discover » ouvre la fiche du projet ; c'est le bouton « Ouvrir » de la fiche qui envoie vers le site.
 * Adaptatif : téléphone (1 colonne), tablette (2 colonnes), ordinateur (3 colonnes et image plus large).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus, Search } from "lucide-react";
import { Mirage } from "@/components/shared/mirage";
import { useT } from "@/lib/i18n";
import { APP_CATEGORIES, APP_CATEGORY_LABEL } from "@/lib/discover";
import { ListingPrice } from "./listing-price";
import { AppIcon, PaysWith, Rating, type AppCard } from "@/components/discover/app-bits";

const catLabel = (c: string) => APP_CATEGORY_LABEL[c as keyof typeof APP_CATEGORY_LABEL] ?? "Other";

function DiscoverButton({ a, className = "" }: { a: AppCard; className?: string }) {
  const { tr } = useT();
  return (
    <Link href={`/discover/${a.id}`}
      className={`shrink-0 rounded-full bg-foreground px-4 py-2 text-center text-[14px] font-bold text-background transition-opacity hover:opacity-90 ${className}`}>
      {tr("Discover")}
    </Link>
  );
}

/** Grande image à la une (pleine largeur sur téléphone), puis la ligne du projet avec son bouton. */
function Hero({ list }: { list: AppCard[] }) {
  const [i, setI] = useState(0);
  useEffect(() => { if (list.length < 2) return; const t = setInterval(() => setI((n) => (n + 1) % list.length), 6000); return () => clearInterval(t); }, [list.length]);
  const a = list[i];
  if (!a) return null;
  return (
    <section className="-mx-4 sm:mx-0">
      <Link href={`/discover/${a.id}`} className="relative block aspect-[16/10] overflow-hidden bg-muted sm:aspect-[21/9] sm:rounded-[28px] lg:aspect-[3/1]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {a.banner && <img key={a.id} src={a.banner} alt="" className="size-full object-cover animate-in fade-in duration-700" />}
        <div className="hero-fade absolute inset-x-0 bottom-0 px-4 pb-12 pt-24 sm:px-6 sm:pb-12">
          <p className="max-w-2xl text-[22px] font-bold leading-tight text-white sm:text-[28px] lg:text-[34px]">{a.tagline}</p>
        </div>
        {list.length > 1 && (
          <div className="absolute right-4 top-4 flex gap-1.5">
            {list.map((x, n) => <span key={x.id} className={`h-1.5 rounded-full transition-all ${n === i ? "w-5 bg-white" : "w-1.5 bg-white/50"}`} />)}
          </div>
        )}
      </Link>
      <div className="relative -mt-1 flex items-center gap-3 bg-background px-4 pb-3 pt-1 sm:mt-0 sm:bg-transparent sm:px-1 sm:pt-3">
        <Link href={`/discover/${a.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          <AppIcon app={a} className="size-12" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-semibold text-foreground">{a.name}</p>
            <p className="flex items-center gap-2 truncate text-[13px] text-muted-foreground"><PaysWith app={a} /><Rating value={a.rating} count={a.ratings} /></p>
          </div>
        </Link>
        <DiscoverButton a={a} />
      </div>
    </section>
  );
}

function RowItem({ a }: { a: AppCard }) {
  const { tr } = useT();
  return (
    <Link href={`/discover/${a.id}`} className="flex items-center gap-3.5 rounded-2xl p-2 transition-colors hover:bg-muted/50">
      <AppIcon app={a} className="size-16 sm:size-[72px]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-foreground">{a.name}</p>
        <p className="truncate text-[13px] text-muted-foreground">{tr(catLabel(a.category))} · {a.tagline}</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground"><Rating value={a.rating} count={a.ratings} />{!a.platform && !a.noToken && <PaysWith app={a} />}</p>
      </div>
    </Link>
  );
}

function RecoTile({ a, copy = false }: { a: AppCard; copy?: boolean }) {
  return (
    <Link href={`/discover/${a.id}`} aria-hidden={copy || undefined} tabIndex={copy ? -1 : undefined} className="w-[104px] shrink-0 sm:w-[120px] lg:w-[132px]">
      <AppIcon app={a} className="aspect-square w-full" />
      <p className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-tight text-foreground">{a.name}</p>
      <Rating value={a.rating} count={a.ratings} className="text-[12px] text-muted-foreground" />
    </Link>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 flex items-center justify-between text-[20px] font-bold text-foreground sm:text-[22px]">{title}<ArrowRight className="size-5 text-muted-foreground" /></h2>
      {children}
    </section>
  );
}

/** Carte « Mettre son site en vitrine » : prix normal barré, gratuit pour l'instant */
function ListCta() {
  const { tr } = useT();
  return (
    <Link href="/discover/submit" className="group flex flex-col gap-4 rounded-[24px] border border-border bg-card p-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:p-5">
      <span className="flex min-w-0 flex-1 items-center gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background transition-transform group-hover:scale-105"><Plus className="size-6" /></span>
        <span className="min-w-0">
          <span className="block text-[16px] font-bold leading-tight">{tr("Showcase your project on Discover")}</span>
          <span className="mt-0.5 block text-[13px] text-muted-foreground">{tr("With your OM token: free until 2027, then ${n} a year. Without a token: ${n} a year.", { n: 80 })}</span>
        </span>
      </span>
      <span className="flex items-center justify-between border-t border-border pt-3 sm:border-0 sm:pt-0">
        <span className="text-[13px] font-semibold text-muted-foreground sm:hidden">{tr("Price")}</span>
        <ListingPrice />
      </span>
    </Link>
  );
}

export function Discover() {
  const { tr } = useT();
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState("");
  const [top, setTop] = useState<AppCard[] | null>(null);
  const [fresh, setFresh] = useState<AppCard[] | null>(null);
  const [boosted, setBoosted] = useState<AppCard[]>([]);

  useEffect(() => {
    fetch("/api/discover/apps?sort=boosted").then((r) => r.json()).then((j) => setBoosted(j.apps ?? [])).catch(() => setBoosted([]));
  }, []);

  useEffect(() => {
    let off = false;
    const t = setTimeout(() => {
      const base = `/api/discover/apps?${cat !== "all" ? `category=${cat}&` : ""}${q.trim() ? `q=${encodeURIComponent(q.trim())}&` : ""}`;
      fetch(`${base}sort=top`).then((r) => r.json()).then((j) => { if (!off) setTop(j.apps ?? []); }).catch(() => { if (!off) setTop([]); });
      fetch(`${base}sort=new`).then((r) => r.json()).then((j) => { if (!off) setFresh(j.apps ?? []); }).catch(() => { if (!off) setFresh([]); });
    }, q ? 300 : 0);
    return () => { off = true; clearTimeout(t); };
  }, [cat, q]);

  const loading = top === null || fresh === null;
  const empty = !loading && top!.length === 0;
  const featured = (top ?? []).filter((a) => a.banner).slice(0, 5);
  const searching = !!q.trim() || cat !== "all";

  return (
    <div className="space-y-7 sm:space-y-9">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <label className="flex h-12 flex-1 items-center gap-2.5 rounded-full bg-muted px-4">
            <Search className="size-5 shrink-0 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value.slice(0, 40))} placeholder={tr("Search projects")} className="min-w-0 flex-1 bg-transparent text-[16px] text-foreground outline-none placeholder:text-muted-foreground" />
          </label>
          <Link href="/discover/submit" aria-label={tr("List my project")} className="flex h-12 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-4 text-[14px] font-bold text-background"><Plus className="size-4" /><span className="hidden sm:inline">{tr("List my project")}</span></Link>
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto scrollbar-none px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {["all", ...APP_CATEGORIES].map((c) => (
            <button key={c} onClick={() => setCat(c)} className={`h-9 shrink-0 rounded-full border px-4 text-[14px] font-semibold ${cat === c ? "border-foreground bg-foreground text-background" : "border-border text-foreground hover:bg-muted"}`}>
              {c === "all" ? tr("All") : tr(catLabel(c))}
            </button>
          ))}
        </div>
      </div>

      {loading ? <div className="flex justify-center py-16"><Mirage className="size-5 text-muted-foreground" /></div> : empty ? (
        <div className="space-y-4">
          <div className="rounded-[28px] border border-border bg-card p-6 text-center">
            <p className="text-[18px] font-bold">{searching ? tr("No project found") : tr("Be the first project on Discover")}</p>
            <p className="mx-auto mt-2 max-w-sm text-[14px] text-muted-foreground">{tr("Launch your token on OM, make it the payment of your website, then showcase it here with images.")}</p>
          </div>
          <ListCta />
        </div>
      ) : (
        <>
          {!searching && featured.length > 0 && <Hero list={featured} />}

          {!searching && boosted.length > 0 && (
            <Section title={tr("Recommended for you")}>
              {boosted.length > 4 ? (
                /* Assez de projets : défile tout seul en boucle (pause au toucher) */
                <div className="ticker-mask -mx-4 overflow-hidden sm:mx-0">
                  <div className="ticker-track flex w-max gap-3 px-4 sm:gap-4 sm:px-0" style={{ animationDuration: `${Math.max(boosted.slice(0, 10).length * 4, 24)}s` }}
                    onTouchStart={(e) => { e.currentTarget.style.animationPlayState = "paused"; }} onTouchEnd={(e) => { e.currentTarget.style.animationPlayState = ""; }}>
                    {[...boosted.slice(0, 10), ...boosted.slice(0, 10)].map((a, n) => <RecoTile key={`${a.id}-${n}`} a={a} copy={n >= Math.min(boosted.length, 10)} />)}
                  </div>
                </div>
              ) : (
                /* Peu de projets : chacun une seule fois, sans répétition */
                <div className="flex gap-3 sm:gap-4">{boosted.map((a) => <RecoTile key={a.id} a={a} />)}</div>
              )}
            </Section>
          )}

          <Section title={searching ? tr("Results") : tr("Top rated")}>
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">{top!.slice(0, searching ? 60 : 9).map((a) => <RowItem key={a.id} a={a} />)}</div>
          </Section>

          {!searching && fresh!.length > 0 && (
            <Section title={tr("New and noteworthy")}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {fresh!.slice(0, 6).map((a) => (
                  <div key={a.id} className="overflow-hidden rounded-[22px] border border-border bg-card">
                    <Link href={`/discover/${a.id}`} className="block aspect-[16/9] bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {a.banner ? <img src={a.banner} alt="" className="size-full object-cover" /> : <span className="flex size-full items-center justify-center"><AppIcon app={a} className="size-20" /></span>}
                    </Link>
                    <div className="flex items-center gap-3 p-3">
                      <Link href={`/discover/${a.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                        <AppIcon app={a} className="size-11" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold">{a.name}</span>
                          <span className="flex items-center gap-2 text-[12px] text-muted-foreground"><Rating value={a.rating} count={a.ratings} />{!a.platform && !a.noToken && <PaysWith app={a} />}</span>
                        </span>
                      </Link>
                      <DiscoverButton a={a} />
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <ListCta />
        </>
      )}
    </div>
  );
}
