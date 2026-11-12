"use client";

/** Page /communities : recherche, populaires / récentes / les miennes, bouton Créer (100 OMERO). */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Search, Users } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { compactCount } from "@/lib/social/tips";
import type { Community } from "@/lib/social/communities-shared";
import { CommunityForm, categoryLabel } from "./community-form";

type Row = Community & { joined?: boolean; role?: string };

export function CommunityLogo({ src, name, className = "size-12 rounded-2xl" }: { src: string | null; name: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="" className={`${className} shrink-0 object-cover`} />
    : <span className={`${className} flex shrink-0 items-center justify-center bg-muted text-lg font-bold text-foreground`}>{name[0]?.toUpperCase()}</span>;
}

export function CommunitiesList() {
  const { tr } = useT();
  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState<"popular" | "new" | "mine">("popular");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [create, setCreate] = useState(false);

  useEffect(() => {
    let off = false;
    setRows(null);
    const t = setTimeout(() => {
      const url = tab === "mine" ? "/api/communities?mine=1" : `/api/communities?sort=${tab}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`;
      fetch(url, { cache: "no-store" }).then((r) => r.json()).then((j) => { if (!off) setRows(j.communities ?? []); }).catch(() => { if (!off) setRows([]); });
    }, q ? 300 : 0);
    return () => { off = true; clearTimeout(t); };
  }, [tab, q]);

  return (
    <div className="mx-auto max-w-xl pb-32 lg:border-x lg:border-border">
      <div className="sticky top-16 z-10 border-b border-border bg-background/90 px-4 pb-0 pt-3 backdrop-blur lg:top-0">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-foreground">{tr("Communities")}</h1>
          <button
            onClick={() => (isAuthenticated ? setCreate(true) : window.dispatchEvent(new CustomEvent("open-wallet-connect")))}
            className="flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-[14px] font-bold text-background"
          ><Plus className="size-4" />{tr("Create")}</button>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-full border border-border px-3.5">
          <Search className="size-4 text-muted-foreground" />
          <input value={q} onChange={(e) => { setQ(e.target.value.slice(0, 40)); if (tab === "mine") setTab("popular"); }} placeholder={tr("Search communities")} className="w-full bg-transparent py-2.5 text-[15px] outline-none" />
        </div>
        <div className="mt-2 flex">
          {([["popular", tr("Popular")], ["new", tr("New")], ...(isAuthenticated ? [["mine", tr("Joined")]] : [])] as [typeof tab, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className="relative flex-1 py-3 text-[15px] font-semibold">
              <span className={tab === k ? "text-foreground" : "text-muted-foreground"}>{label}</span>
              {tab === k && <span className="absolute inset-x-1/4 bottom-0 h-1 rounded-full bg-foreground" />}
            </button>
          ))}
        </div>
      </div>

      {!rows ? <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        : rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Users className="mx-auto size-10 text-muted-foreground" />
            <p className="mt-3 text-[15px] font-semibold text-foreground">{tab === "mine" ? tr("You haven't joined a community yet") : tr("No community yet")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{tr("Create one for 100 OMERO and gather your holders, your traders or your friends.")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((c) => (
              <li key={c.id}>
                <Link href={`/c/${c.slug}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/40">
                  <CommunityLogo src={c.logo_src} name={c.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-bold text-foreground">{c.name}</p>
                    <p className="truncate text-[13px] text-muted-foreground">{tr(categoryLabel(c.category))} · {compactCount(c.member_count)} {c.member_count === 1 ? tr("member") : tr("members")}</p>
                    {c.description && <p className="mt-0.5 line-clamp-1 text-[13px] text-muted-foreground">{c.description}</p>}
                  </div>
                  {(c.joined || c.role) && <span className="shrink-0 rounded-full border border-border px-3 py-1 text-[12px] font-bold text-muted-foreground">{c.role === "admin" ? "Admin" : c.role === "mod" ? "Mod" : tr("Joined")}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      {create && <CommunityForm onClose={() => setCreate(false)} />}
    </div>
  );
}
