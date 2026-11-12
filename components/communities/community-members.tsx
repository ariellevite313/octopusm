"use client";

/** /c/[slug]/members : Tous / Modérateurs, recherche, rôles, et actions de modération (nommer, retirer). */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, MoreHorizontal, Search } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { shortAddress } from "@/lib/format";
import type { CommunityRole } from "@/lib/social/communities-shared";

type M = { wallet: string; role: CommunityRole; name: string | null; avatar: string | null; username: string | null };

export function CommunityMembers({ slug }: { slug: string }) {
  const { tr } = useT();
  const { walletAddress } = useAuth();
  const [tab, setTab] = useState<"all" | "mods">("all");
  const [rows, setRows] = useState<M[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [me, setMe] = useState<CommunityRole | null>(null);
  const [name, setName] = useState("");
  const [menu, setMenu] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/communities/${slug}`, { cache: "no-store" }).then((r) => r.json()).then((j) => {
      setName(j.community?.name ?? "");
      setMe(j.viewer?.status === "active" ? j.viewer.role : null);
    }).catch(() => {});
  }, [slug, walletAddress]);

  const load = useCallback((offset = 0) => {
    fetch(`/api/communities/${slug}/members?offset=${offset}${tab === "mods" ? "&mods=1" : ""}`, { cache: "no-store" })
      .then((r) => r.json()).then((j) => { setRows((l) => (offset ? [...(l ?? []), ...(j.members ?? [])] : j.members ?? [])); setNext(j.next ?? null); })
      .catch(() => setRows([]));
  }, [slug, tab]);
  useEffect(() => { setRows(null); load(0); }, [load]);

  async function act(action: "promote" | "demote" | "ban", wallet: string) {
    setMenu(null);
    const r = await fetch(`/api/communities/${slug}/moderate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, wallet }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(tr(j.error ?? "Something went wrong")); return; }
    toast.success(action === "ban" ? tr("Member removed") : action === "promote" ? tr("Moderator added") : tr("Moderator removed"));
    load(0);
  }

  const shown = (rows ?? []).filter((m) => {
    const s = q.trim().toLowerCase();
    return !s || (m.name ?? "").toLowerCase().includes(s) || (m.username ?? "").toLowerCase().includes(s) || m.wallet.toLowerCase().includes(s);
  });
  const canAct = (m: M) => m.role !== "admin" && (me === "admin" || (me === "mod" && m.role === "member"));

  return (
    <div className="mx-auto max-w-xl pb-32 lg:border-x lg:border-border">
      <div className="sticky top-16 z-10 border-b border-border bg-background/90 px-3 pt-2 backdrop-blur lg:top-0">
        <div className="flex items-center gap-3">
          <Link href={`/c/${slug}`} aria-label={tr("Back")} className="flex size-9 items-center justify-center rounded-full hover:bg-muted"><ArrowLeft className="size-5" /></Link>
          <div className="min-w-0">
            <p className="text-[17px] font-bold text-foreground">{tr("Members")}</p>
            {name && <p className="truncate text-[13px] text-muted-foreground">{name}</p>}
          </div>
        </div>
        <div className="mx-1 mt-2 flex items-center gap-2 rounded-full border border-border px-3.5">
          <Search className="size-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value.slice(0, 40))} placeholder={tr("Search for people")} className="w-full bg-transparent py-2.5 text-[15px] outline-none" />
        </div>
        <div className="mt-1 flex">
          {([["all", tr("All")], ["mods", tr("Moderators")]] as ["all" | "mods", string][]).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className="relative flex-1 py-3 text-[15px] font-semibold">
              <span className={tab === k ? "text-foreground" : "text-muted-foreground"}>{label}</span>
              {tab === k && <span className="absolute inset-x-1/3 bottom-0 h-1 rounded-full bg-foreground" />}
            </button>
          ))}
        </div>
      </div>

      {!rows ? <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div> : (
        <ul>
          {shown.map((m) => (
            <li key={m.wallet} className="relative flex items-center gap-3 px-4 py-3">
              <Link href={`/profile/${m.wallet}`} className="flex min-w-0 flex-1 items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {m.avatar ? <img src={m.avatar} alt="" className="size-11 rounded-full object-cover" /> : <span className="flex size-11 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground">{(m.name ?? m.wallet)[0]?.toUpperCase()}</span>}
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-bold text-foreground">{m.name ?? shortAddress(m.wallet)}</span>
                    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold ${m.role === "member" ? "text-muted-foreground" : "bg-foreground text-background"}`}>{m.role === "admin" ? "Admin" : m.role === "mod" ? "Mod" : tr("Member")}</span>
                  </span>
                  <span className="block truncate text-[13px] text-muted-foreground">{m.username ? `@${m.username}` : shortAddress(m.wallet)}</span>
                </span>
              </Link>
              {canAct(m) && (
                <div className="relative">
                  <button onClick={() => setMenu(menu === m.wallet ? null : m.wallet)} aria-label={tr("More")} className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><MoreHorizontal className="size-5" /></button>
                  {menu === m.wallet && (
                    <div role="menu" onMouseLeave={() => setMenu(null)} className="absolute right-0 top-10 z-20 w-56 overflow-hidden rounded-2xl border border-border bg-background shadow-xl">
                      {me === "admin" && (m.role === "mod"
                        ? <button onClick={() => act("demote", m.wallet)} className="block w-full px-4 py-3 text-left text-[14px] font-semibold hover:bg-muted">{tr("Remove as moderator")}</button>
                        : <button onClick={() => act("promote", m.wallet)} className="block w-full px-4 py-3 text-left text-[14px] font-semibold hover:bg-muted">{tr("Make moderator")}</button>)}
                      <button onClick={() => act("ban", m.wallet)} className="block w-full px-4 py-3 text-left text-[14px] font-semibold text-down hover:bg-muted">{tr("Remove from community")}</button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
          {next !== null && !q && <li><button onClick={() => load(next)} className="w-full py-4 text-[14px] font-semibold text-muted-foreground hover:text-foreground">{tr("Load more")}</button></li>}
        </ul>
      )}
    </div>
  );
}
