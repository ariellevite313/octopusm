"use client";

/**
 * Discover : la vitrine des apps construites avec un token OM, comme un store.
 * Recherche, catégories, apps à la une, recommandées et nouveautés. Chaque app paie dans son propre token.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus, Search } from "lucide-react";
import { Mirage } from "@/components/shared/mirage";
import { useT } from "@/lib/i18n";
import { APP_CATEGORIES, APP_CATEGORY_LABEL } from "@/lib/discover";
import { AppIcon, PaysWith, Rating, type AppCard } from "@/components/discover/app-bits";

function Featured({ a }: { a: AppCard }) {
  const { tr } = useT();
  return (
    <Link href={`/discover/${a.id}`} className="block w-[86%] shrink-0 snap-start sm:w-[420px]">
      <div className="relative aspect-[16/9] overflow-hidden rounded-[22px] bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {a.banner && <img src={a.banner} alt="" className="size-full object-cover" />}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-12">
          <p className="line-clamp-2 text-[19px] font-bold leading-tight text-white">{a.tagline}</p>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-3">
        <AppIcon app={a} className="size-11" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-foreground">{a.name}</p>
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">{tr(APP_CATEGORY_LABEL[a.category as keyof typeof APP_CATEGORY_LABEL] ?? "Other")}<Rating value={a.rating} count={a.ratings} /></p>
        </div>
        <span className="rounded-full bg-foreground px-4 py-1.5 text-[13px] font-bold text-background">{tr("Open")}</span>
      </div>
    </Link>
  );
}

function RowItem({ a }: { a: AppCard }) {
  const { tr } = useT();
  return (
    <Link href={`/discover/${a.id}`} className="flex items-center gap-3.5 rounded-2xl px-1 py-2.5 transition-colors hover:bg-muted/40">
      <AppIcon app={a} className="size-16" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-foreground">{a.name}</p>
        <p className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">{a.tagline}</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
          <Rating value={a.rating} count={a.ratings} /><span>{tr(APP_CATEGORY_LABEL[a.category as keyof typeof APP_CATEGORY_LABEL] ?? "Other")}</span><PaysWith app={a} />
        </p>
      </div>
    </Link>
  );
}

function Section({ title, children, href }: { title: string; children: React.ReactNode; href?: string }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[19px] font-bold text-foreground">{title}</h2>
        {href && <Link href={href} aria-label={title} className="flex size-9 items-center justify-center rounded-full hover:bg-muted"><ArrowRight className="size-5" /></Link>}
      </div>
      {children}
    </section>
  );
}

export function Discover() {
  const { tr } = useT();
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState("");
  const [top, setTop] = useState<AppCard[] | null>(null);
  const [fresh, setFresh] = useState<AppCard[] | null>(null);

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

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <label className="flex h-12 flex-1 items-center gap-2.5 rounded-full bg-muted px-4">
            <Search className="size-5 shrink-0 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value.slice(0, 40))} placeholder={tr("Search apps")} className="min-w-0 flex-1 bg-transparent text-[16px] text-foreground outline-none placeholder:text-muted-foreground" />
          </label>
          <Link href="/discover/submit" aria-label={tr("List my app")} className="flex h-12 items-center gap-1.5 rounded-full bg-foreground px-4 text-[14px] font-bold text-background"><Plus className="size-4" /><span className="hidden sm:inline">{tr("List my app")}</span></Link>
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto scrollbar-none px-4">
          {["all", ...APP_CATEGORIES].map((c) => (
            <button key={c} onClick={() => setCat(c)} className={`h-9 shrink-0 rounded-full border px-4 text-[14px] font-semibold ${cat === c ? "border-foreground bg-foreground text-background" : "border-border text-foreground"}`}>
              {c === "all" ? tr("All") : tr(APP_CATEGORY_LABEL[c as keyof typeof APP_CATEGORY_LABEL])}
            </button>
          ))}
        </div>
      </div>

      {loading ? <div className="flex justify-center py-16"><Mirage className="size-5 text-muted-foreground" /></div> : empty ? (
        <div className="rounded-[28px] border border-border bg-card p-6 text-center">
          <p className="text-[18px] font-bold">{q || cat !== "all" ? tr("No app found") : tr("Be the first app on OM")}</p>
          <p className="mx-auto mt-2 max-w-sm text-[14px] text-muted-foreground">{tr("Launch your token on OM, make it the payment of your app, then list your app here with your site and images.")}</p>
          <Link href="/discover/submit" className="mt-4 inline-flex h-12 items-center rounded-full bg-foreground px-6 text-[15px] font-bold text-background">{tr("List my app")}</Link>
        </div>
      ) : (
        <>
          {featured.length > 0 && (
            <div className="-mx-4 flex snap-x snap-mandatory scroll-pl-4 gap-3 overflow-x-auto scrollbar-none px-4">
              {featured.map((a) => <Featured key={a.id} a={a} />)}
            </div>
          )}

          <Section title={tr("Recommended for you")}>
            <div className="-mx-4 flex gap-3 overflow-x-auto scrollbar-none px-4">
              {top!.slice(0, 10).map((a) => (
                <Link key={a.id} href={`/discover/${a.id}`} className="w-[104px] shrink-0">
                  <AppIcon app={a} className="size-[104px]" />
                  <p className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-tight text-foreground">{a.name}</p>
                  <Rating value={a.rating} count={a.ratings} className="text-[12px] text-muted-foreground" />
                </Link>
              ))}
            </div>
          </Section>

          <Section title={tr("Top rated")}>
            <div className="grid gap-x-6 lg:grid-cols-2">{top!.slice(0, 8).map((a) => <RowItem key={a.id} a={a} />)}</div>
          </Section>

          <Section title={tr("New on OM")}>
            <div className="grid gap-x-6 lg:grid-cols-2">{fresh!.slice(0, 8).map((a) => <RowItem key={a.id} a={a} />)}</div>
          </Section>

          <Link href="/discover/submit" className="flex items-center gap-4 rounded-[24px] border border-border bg-card p-4">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-foreground text-background"><Plus className="size-6" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold">{tr("List your app on Discover")}</span>
              <span className="block text-[13px] text-muted-foreground">{tr("Your OM token must be the payment of your app.")}</span>
            </span>
            <ArrowRight className="size-5" />
          </Link>
        </>
      )}
    </div>
  );
}
