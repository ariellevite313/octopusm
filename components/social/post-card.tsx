"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Download, EyeOff, Flag, Heart, Loader2, MessageCircle, MoreVertical, Eye, Send, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { shortAddress } from "@/lib/format";
import type { FeedPost } from "@/lib/social/posts";
import { TokenCardView } from "./token-card";
import { OctoBadge } from "@/components/leaderboard/octo-tier-badge";
import { TokenPill } from "./token-pill";
import { PostReplies } from "./post-replies";

function ago(iso: string, tr: (s: string, v?: Record<string, string | number>) => string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return tr("just now");
  if (s < 3600) return tr("{n}m ago", { n: Math.floor(s / 60) });
  if (s < 86400) return tr("{n}h ago", { n: Math.floor(s / 3600) });
  return tr("{n}d ago", { n: Math.floor(s / 86400) });
}

function Avatar({ src, name, size = 44, ring = false }: { src: string | null; name: string; size?: number; ring?: boolean }) {
  const inner = src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="size-full rounded-full object-cover" />
  ) : (
    <div className="flex size-full items-center justify-center rounded-full bg-primary text-sm font-bold text-white">{name[0]?.toUpperCase()}</div>
  );
  return (
    <div
      style={{ width: size, height: size }}
      className={`shrink-0 rounded-full ${ring ? "bg-gradient-to-br from-violet-500 to-orange-500 p-[2.5px]" : ""}`}
    >
      <div className={`size-full rounded-full ${ring ? "border-2 border-background" : ""}`}>{inner}</div>
    </div>
  );
}

/** Texte : 4 lignes puis « more ». Les $TICKER sont en couleur. */
function PostText({ body }: { body: string }) {
  const { tr } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el && !open) setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [body, open]);
  const parts = body.split(/(\$[A-Za-z][A-Za-z0-9]{1,15})/g);
  return (
    <div className="px-1">
      <div ref={ref} className={`whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground ${open ? "" : "line-clamp-4"}`}>
        {parts.map((p, i) => (p.startsWith("$") ? <span key={i} className="font-bold text-primary">{p}</span> : p))}
      </div>
      {clamped && !open && (
        <button onClick={() => setOpen(true)} className="mt-0.5 text-sm font-semibold text-muted-foreground hover:text-foreground">{tr("more")}</button>
      )}
    </div>
  );
}

function Media({
  post, children,
}: { post: FeedPost; children: React.ReactNode }) {
  const two = post.images.length > 1;
  return (
    <div className="relative overflow-hidden rounded-[26px] bg-muted">
      {/* Fond flou fait de l'image elle-même */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={post.images[0]} alt="" aria-hidden className="absolute inset-0 size-full scale-125 object-cover opacity-90 blur-2xl" />
      {two ? (
        <div className="relative grid grid-cols-2 gap-[3px]">
          {post.images.map((u) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={u} src={u} alt="" className="aspect-square w-full object-cover" loading="lazy" />
          ))}
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.images[0]} alt="" className="relative mx-auto block max-h-[460px] w-full object-contain" loading="lazy" />
      )}
      {children}
    </div>
  );
}

export function PostCard({ post: initial, onRemoved }: { post: FeedPost; onRemoved?: (id: string) => void }) {
  const { tr } = useT();
  const { isAuthenticated } = useAuth();
  const [post, setPost] = useState(initial);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const root = useRef<HTMLElement>(null);
  const viewed = useRef(false);

  const name = post.author_name ?? shortAddress(post.author);

  // Une vue est comptée quand la publication est réellement affichée à l'écran
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => {
      if (es[0].isIntersecting && !viewed.current) {
        viewed.current = true;
        fetch(`/api/posts/${post.id}/view`, { method: "POST" })
          .then((r) => r.json())
          .then((j) => j.view_count != null && setPost((p) => ({ ...p, view_count: j.view_count })))
          .catch(() => {});
        io.disconnect();
      }
    }, { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, [post.id]);

  function needAuth() {
    if (!isAuthenticated) { window.dispatchEvent(new CustomEvent("open-wallet-connect")); return true; }
    return false;
  }

  async function like() {
    if (needAuth()) return;
    setPost((p) => ({ ...p, liked_by_me: !p.liked_by_me, like_count: p.like_count + (p.liked_by_me ? -1 : 1) }));
    const r = await fetch(`/api/posts/${post.id}/like`, { method: "POST" });
    if (r.ok) { const j = await r.json(); setPost((p) => ({ ...p, liked_by_me: j.liked, like_count: j.like_count })); }
  }

  async function follow() {
    if (needAuth()) return;
    const r = await fetch("/api/follow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet: post.author }) });
    if (r.ok) { const j = await r.json(); setPost((p) => ({ ...p, following_author: j.is_following })); }
    else toast.error(tr("Something went wrong"));
  }

  async function share() {
    const url = `${location.origin}/profile/${post.author}`;
    try {
      if (navigator.share) await navigator.share({ url });
      else { await navigator.clipboard.writeText(url); toast.success(tr("Link copied")); }
    } catch { /* annulé */ }
  }

  async function saveImages() {
    setMenu(false);
    setBusy(true);
    try {
      for (const [i, u] of post.images.entries()) {
        const blob = await (await fetch(u)).blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `omdot-${post.id.slice(0, 8)}-${i + 1}.${(blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg")}`;
        a.click();
        URL.revokeObjectURL(a.href);
      }
    } catch { toast.error(tr("Could not save the image")); }
    setBusy(false);
  }

  async function hide() {
    setMenu(false);
    if (needAuth()) return;
    await fetch(`/api/posts/${post.id}/hide`, { method: "POST" });
    onRemoved?.(post.id);
  }

  async function report() {
    setMenu(false);
    if (needAuth()) return;
    const r = await fetch(`/api/posts/${post.id}/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (r.ok) toast.success(tr("Thanks, we will review this post"));
    else toast.error(tr((await r.json().catch(() => ({}))).error ?? "Something went wrong"));
  }

  async function remove() {
    setMenu(false);
    const r = await fetch(`/api/posts/${post.id}`, { method: "DELETE" });
    if (r.ok) onRemoved?.(post.id); else toast.error(tr("Something went wrong"));
  }

  const menuItems = (
    <div className="absolute right-3 top-12 z-20 w-52 overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-xl">
      {post.images.length > 0 && (
        <button onClick={saveImages} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-muted">
          <Download className="size-[18px]" />{tr("Save image")}
        </button>
      )}
      {post.mine ? (
        <button onClick={remove} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-down hover:bg-muted">
          <Trash2 className="size-[18px]" />{tr("Delete")}
        </button>
      ) : (
        <>
          <button onClick={hide} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-muted">
            <EyeOff className="size-[18px]" />{tr("Hide this post")}
          </button>
          <button onClick={report} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-down hover:bg-muted">
            <Flag className="size-[18px]" />{tr("Report")}
          </button>
        </>
      )}
    </div>
  );

  const actions = (
    <>
      <button onClick={like} aria-label={tr("Like")} className="flex items-center gap-1.5">
        <Heart className={`size-[26px] ${post.liked_by_me ? "fill-[#f43f5e] text-[#f43f5e]" : "text-foreground"}`} strokeWidth={post.liked_by_me ? 0 : 1.9} />
      </button>
      <button onClick={() => setShowReplies((v) => !v)} aria-label={tr("Replies")} className="flex items-center gap-1.5 text-foreground">
        <MessageCircle className="size-6" strokeWidth={1.9} />
        {post.reply_count > 0 && <span className="num text-sm font-semibold">{post.reply_count}</span>}
      </button>
      <button onClick={share} aria-label={tr("Share")} className="text-foreground"><Send className="size-[23px]" strokeWidth={1.9} /></button>
    </>
  );

  const likers = (
    <div className="flex items-center gap-2 text-[13px] font-semibold">
      {post.liker_avatars.length > 0 && (
        <div className="flex">
          {post.liker_avatars.map((a, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={a} alt="" className="-ml-2 size-6 rounded-full border-2 border-background object-cover first:ml-0" />
          ))}
        </div>
      )}
      <span className="num">{post.like_count} {tr("liked")}</span>
    </div>
  );

  return (
    <article ref={root} className="px-4 py-5">
      {/* Auteur */}
      <div className="mb-3 flex items-center gap-3 px-1">
        <Link href={`/profile/${post.author}`}><Avatar src={post.author_avatar} name={name} ring /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <Link href={`/profile/${post.author}`} className="flex min-w-0 items-center gap-1.5 text-[15px] font-bold text-foreground">
              <span className="truncate">{name}</span>
              <OctoBadge totalOcto={post.author_octo} size={16} />
            </Link>
            <TokenPill token={post.author_token} size={16} />
          </div>
          <p className="text-xs text-muted-foreground">{ago(post.created_at, tr)}</p>
        </div>
        {!post.mine && (
          <button
            onClick={follow}
            className={`shrink-0 rounded-full border px-3.5 py-1 text-[12px] font-bold ${post.following_author ? "border-border text-muted-foreground" : "border-foreground text-foreground"}`}
          >
            {post.following_author ? tr("Following") : tr("Follow")}
          </button>
        )}
        {post.images.length === 0 && (
          <div className="relative">
            <button onClick={() => setMenu((v) => !v)} aria-label={tr("More")} className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><MoreVertical className="size-[18px]" /></button>
            {menu && <div onMouseLeave={() => setMenu(false)}>{menuItems}</div>}
          </div>
        )}
      </div>

      {post.body && <PostText body={post.body} />}

      {/* Image (version « entière ») : l'image n'est jamais recouverte, la barre d'actions s'ajoute dessous */}
      {post.images.length > 0 && (
        <div className="mt-3">
          <Media post={post}>
            <button
              onClick={() => setMenu((v) => !v)}
              aria-label={tr("More")}
              className="absolute right-3 top-3 z-10 flex size-9 items-center justify-center rounded-full bg-white/80 text-neutral-900 backdrop-blur"
            >
              {busy ? <Loader2 className="size-[18px] animate-spin" /> : <MoreVertical className="size-[18px]" strokeWidth={2.6} />}
            </button>
            {menu && <div onMouseLeave={() => setMenu(false)}>{menuItems}</div>}
            {/* Barre : encoche en bas à gauche, avatars + likes en bas à droite */}
            <div className="relative flex h-[54px] items-stretch">
              <div className="relative flex w-[58%] min-w-[210px] items-center gap-5 rounded-tr-[24px] bg-background pl-3">
                <span aria-hidden className="absolute -top-[24px] left-0 size-[24px] bg-[radial-gradient(circle_at_100%_0,transparent_23.5px,var(--background)_24px)]" />
                {actions}
                <span aria-hidden className="absolute -right-[24px] bottom-0 size-[24px] bg-[radial-gradient(circle_at_100%_0,transparent_23.5px,var(--background)_24px)]" />
              </div>
              <div className="relative flex flex-1 items-center justify-end pr-3 text-white [text-shadow:0_1px_4px_rgba(0,0,0,.6)]">{likers}</div>
            </div>
          </Media>
        </div>
      )}

      {post.images.length === 0 && (
        <div className="mt-3 flex items-center gap-5 px-1">{actions}<div className="ml-auto">{likers}</div></div>
      )}

      <div className="mt-2 flex items-center gap-3 px-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Eye className="size-3.5" /><span className="num">{post.view_count}</span></span>
      </div>

      {post.ticker && <div className="px-1"><TokenCardView ticker={post.ticker} author={post.author} /></div>}

      {showReplies && <PostReplies postId={post.id} onCount={(n) => setPost((p) => ({ ...p, reply_count: n }))} />}
    </article>
  );
}

