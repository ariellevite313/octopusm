"use client";

/** Page d'une communauté (/c/[slug]) : en-tête, rejoindre, épingler sur le profil, onglets Top / Récents / Médias / À propos. */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Loader2, Pin, PinOff, Settings, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { shortAddress } from "@/lib/format";
import { compactCount } from "@/lib/social/tips";
import type { FeedPost } from "@/lib/social/posts";
import type { Community, CommunityRole } from "@/lib/social/communities-shared";
import { PostCard } from "@/components/social/post-card";
import { ComposeModal } from "@/components/social/compose-modal";
import { CommunityForm, categoryLabel } from "./community-form";
import { CommunityLogo } from "./communities-list";

type Viewer = { role: CommunityRole; status: string; pinned: boolean } | null;
type Tab = "top" | "latest" | "media" | "about";

export function CommunityView({ slug }: { slug: string }) {
  const { tr } = useT();
  const { isAuthenticated } = useAuth();
  const [c, setC] = useState<Community | null>(null);
  const [faces, setFaces] = useState<string[]>([]);
  const [viewer, setViewer] = useState<Viewer>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<Tab>("latest");
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [compose, setCompose] = useState(false);
  const [edit, setEdit] = useState(false);

  const loadInfo = useCallback(() => {
    fetch(`/api/communities/${slug}`, { cache: "no-store" }).then(async (r) => {
      if (r.status === 404) { setMissing(true); return; }
      const j = await r.json();
      setC(j.community); setFaces(j.faces ?? []); setViewer(j.viewer ?? null);
    }).catch(() => {});
  }, [slug]);
  useEffect(() => { loadInfo(); }, [loadInfo, isAuthenticated]);

  const feedUrl = useCallback((before?: string | null) => {
    const sort = tab === "top" ? "&sort=top" : tab === "media" ? "&kind=media" : "";
    return `/api/posts?community=${slug}&limit=10${sort}${before ? `&before=${encodeURIComponent(before)}` : ""}`;
  }, [slug, tab]);
  useEffect(() => {
    if (tab === "about") return;
    let off = false;
    setPosts(null);
    fetch(feedUrl(), { cache: "no-store" }).then((r) => r.json()).then((j) => { if (!off) { setPosts(j.posts ?? []); setNext(j.next ?? null); } }).catch(() => { if (!off) setPosts([]); });
    return () => { off = true; };
  }, [feedUrl, tab]);
  async function more() {
    if (!next) return;
    const j = await fetch(feedUrl(next), { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (j) { setPosts((l) => [...(l ?? []), ...(j.posts ?? [])]); setNext(j.next ?? null); }
  }

  const member = viewer?.status === "active";
  const isMod = member && (viewer?.role === "admin" || viewer?.role === "mod");

  async function join() {
    if (!isAuthenticated) { window.dispatchEvent(new CustomEvent("open-wallet-connect")); return; }
    setBusy(true);
    const r = await fetch(`/api/communities/${slug}/join`, { method: member ? "DELETE" : "POST" });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { toast.error(tr(j.error ?? "Something went wrong")); return; }
    toast.success(member ? tr("You left the community") : tr("Welcome to the community"));
    loadInfo();
  }
  async function pinProfile() {
    const r = await fetch(`/api/communities/${slug}/pin`, { method: viewer?.pinned ? "DELETE" : "POST" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(tr(j.error ?? "Something went wrong")); return; }
    toast.success(viewer?.pinned ? tr("Removed from your profile") : tr("Shown on your profile"));
    loadInfo();
  }
  function share() {
    const url = `${window.location.origin}/c/${slug}`;
    if (navigator.share) navigator.share({ title: c?.name, url }).catch(() => {});
    else navigator.clipboard.writeText(url).then(() => toast.success(tr("Link copied")));
  }
  async function moderate(action: "pin" | "unpin" | "remove_post", postId: string) {
    const r = await fetch(`/api/communities/${slug}/moderate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, post_id: postId }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(tr(j.error ?? "Something went wrong")); return; }
    if (action === "remove_post") setPosts((l) => (l ?? []).filter((p) => p.id !== postId));
    else { setPosts((l) => (l ?? []).map((p) => ({ ...p, pinned: action === "pin" ? p.id === postId : false }))); loadInfo(); }
    toast.success(action === "remove_post" ? tr("Removed from the community") : action === "pin" ? tr("Pinned") : tr("Unpinned"));
  }

  if (missing) return (
    <div className="mx-auto max-w-xl px-6 py-24 text-center">
      <p className="text-lg font-bold text-foreground">{tr("Community not found")}</p>
      <Link href="/communities" className="mt-4 inline-block rounded-full bg-foreground px-5 py-2.5 text-sm font-bold text-background">{tr("See communities")}</Link>
    </div>
  );
  if (!c) return <div className="flex justify-center py-24"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="mx-auto max-w-xl pb-32 lg:border-x lg:border-border">
      {/* Barre du haut */}
      <div className="sticky top-16 z-10 flex items-center gap-3 border-b border-border bg-background/90 px-3 py-2 backdrop-blur lg:top-0">
        <Link href="/communities" aria-label={tr("Back")} className="flex size-9 items-center justify-center rounded-full hover:bg-muted"><ArrowLeft className="size-5" /></Link>
        <p className="min-w-0 flex-1 truncate text-[17px] font-bold text-foreground">{c.name}</p>
        {viewer?.role === "admin" && member && <button onClick={() => setEdit(true)} aria-label={tr("Edit community")} className="flex size-9 items-center justify-center rounded-full hover:bg-muted"><Settings className="size-5" /></button>}
      </div>

      {/* Bannière (ou grand logo) */}
      {c.banner_src
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={c.banner_src} alt="" className="h-40 w-full object-cover sm:h-48" />
        : <div className="flex h-40 items-center justify-center bg-muted/50 sm:h-48"><CommunityLogo src={c.logo_src} name={c.name} className="size-28 rounded-[28px]" /></div>}

      <div className="px-4 pb-3">
        {c.banner_src && <div className="-mt-10"><CommunityLogo src={c.logo_src} name={c.name} className="size-20 rounded-2xl border-4 border-background" /></div>}
        <h1 className="mt-3 text-[26px] font-extrabold leading-tight tracking-tight text-foreground">{c.name}</h1>
        <span className="mt-2 inline-block rounded-full border border-border px-3 py-0.5 text-[13px] font-semibold text-foreground">{tr(categoryLabel(c.category))}</span>
        {c.description && <p className="mt-2 whitespace-pre-line text-[15px] text-muted-foreground">{c.description}</p>}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link href={`/c/${c.slug}/members`} className="flex items-center gap-2">
            <span className="flex -space-x-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {faces.map((f, i) => <img key={i} src={f} alt="" className="size-7 rounded-full border-2 border-background object-cover" />)}
            </span>
            <span className="text-[14px]"><span className="font-bold text-foreground">{compactCount(c.member_count)}</span> <span className="text-muted-foreground">{c.member_count === 1 ? tr("Member") : tr("Members")}</span></span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={share} aria-label={tr("Share")} className="flex size-10 items-center justify-center rounded-full border border-border text-foreground hover:bg-muted"><Share2 className="size-[18px]" /></button>
            {member && (
              <button onClick={pinProfile} title={viewer?.pinned ? tr("Remove from my profile") : tr("Show on my profile")} aria-label={viewer?.pinned ? tr("Remove from my profile") : tr("Show on my profile")} className={`flex size-10 items-center justify-center rounded-full border ${viewer?.pinned ? "border-foreground bg-foreground text-background" : "border-border text-foreground hover:bg-muted"}`}>
                {viewer?.pinned ? <PinOff className="size-[18px]" /> : <Pin className="size-[18px]" />}
              </button>
            )}
            {viewer?.status === "banned" ? <span className="rounded-full border border-border px-4 py-2 text-[14px] font-bold text-muted-foreground">{tr("Removed")}</span>
              : viewer?.role === "admin" ? <span className="rounded-full border border-border px-4 py-2 text-[14px] font-bold text-foreground">Admin</span>
              : (
                <button onClick={join} disabled={busy} className={`group flex h-10 items-center gap-1.5 rounded-full px-5 text-[14px] font-bold disabled:opacity-50 ${member ? "border border-border text-foreground" : "bg-foreground text-background"}`}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : member ? <><Check className="size-4 group-hover:hidden" /><span className="group-hover:hidden">{tr("Joined")}</span><span className="hidden group-hover:inline">{tr("Leave")}</span></> : tr("Join")}
                </button>
              )}
          </div>
        </div>
        {c.hashtags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
            {c.hashtags.map((t) => <Link key={t} href={`/?tag=${encodeURIComponent(t.toLowerCase())}`} className="text-[14px] font-semibold text-foreground hover:underline">#{t}</Link>)}
          </div>
        )}
      </div>

      {/* Onglets */}
      <div className="flex border-b border-border">
        {([["top", tr("Top")], ["latest", tr("Latest")], ["media", tr("Media")], ["about", tr("About")]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className="relative flex-1 py-3.5 text-[15px] font-semibold">
            <span className={tab === k ? "text-foreground" : "text-muted-foreground"}>{label}</span>
            {tab === k && <span className="absolute inset-x-1/4 bottom-0 h-1 rounded-full bg-foreground" />}
          </button>
        ))}
      </div>

      {tab !== "about" && member && (
        <button onClick={() => setCompose(true)} className="flex w-full items-center gap-3 border-b border-border px-4 py-4 text-left text-[15px] text-muted-foreground hover:bg-muted/40">
          <span className="flex-1">{tr("Post in {name}", { name: c.name })}</span>
          <span className="rounded-full bg-foreground px-4 py-1.5 text-[14px] font-bold text-background">{tr("Post")}</span>
        </button>
      )}

      {tab === "about" ? (
        <div className="space-y-4 px-4 py-5 text-[15px]">
          {c.description && <p className="whitespace-pre-line text-foreground">{c.description}</p>}
          <p className="text-muted-foreground">{tr("Created on {date}", { date: new Date(c.created_at).toLocaleDateString() })}</p>
          <p className="text-muted-foreground">{tr("Created by")} <Link href={`/profile/${c.creator}`} className="font-semibold text-foreground hover:underline">{shortAddress(c.creator)}</Link></p>
          <div className="rounded-2xl border border-border p-4">
            <p className="font-bold text-foreground">{tr("Rules")}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>{tr("Stay on topic and be respectful.")}</li>
              <li>{tr("No scams, no fake giveaways, no impersonation.")}</li>
              <li>{tr("The OMdotfun policy applies to every post.")}</li>
            </ul>
          </div>
        </div>
      ) : !posts ? <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        : posts.length === 0 ? <p className="px-6 py-16 text-center text-sm text-muted-foreground">{member ? tr("No post yet. Be the first to post.") : tr("No post yet. Join to post.")}</p>
        : (
          <div className="divide-y divide-border">
            {posts.map((p) => (
              <div key={p.feed_key}>
                <PostCard post={p} hideCommunity onRemoved={(id) => setPosts((l) => (l ?? []).filter((x) => x.id !== id))} />
                {isMod && (
                  <div className="-mt-3 flex gap-2 px-5 pb-3">
                    <button onClick={() => moderate(p.pinned ? "unpin" : "pin", p.id)} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[12px] font-semibold text-muted-foreground hover:text-foreground">
                      {p.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}{p.pinned ? tr("Unpin") : tr("Pin")}
                    </button>
                    <button onClick={() => moderate("remove_post", p.id)} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[12px] font-semibold text-muted-foreground hover:text-foreground">
                      <Trash2 className="size-3.5" />{tr("Remove from community")}
                    </button>
                  </div>
                )}
              </div>
            ))}
            {next && <button onClick={more} className="w-full py-4 text-[14px] font-semibold text-muted-foreground hover:text-foreground">{tr("Load more")}</button>}
          </div>
        )}

      {compose && <ComposeModal community={{ slug: c.slug, name: c.name }} onClose={() => setCompose(false)} onPosted={(p) => { setPosts((l) => [{ ...p, community: { slug: c.slug, name: c.name, logo_src: c.logo_src } }, ...(l ?? [])]); setTab("latest"); }} />}
      {edit && <CommunityForm edit={c} onClose={() => setEdit(false)} onSaved={loadInfo} />}
    </div>
  );
}
