"use client";

/** Lecture d'un article : couverture, titre, auteur, texte ; en haut le titre se fixe au défilement, barre d'actions en bas. */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/providers/auth-provider";
import { shortAddress } from "@/lib/format";
import type { FeedPost } from "@/lib/social/posts";
import { PostCard } from "./post-card";
import { PostReplies } from "./post-replies";
import { ArticleBody } from "./article-body";
import { ArticleCover } from "./article-card";

export function ArticleView({ id, title, cover, md, minutes }: { id: string; title: string; cover: string | null; md: string; minutes: number }) {
  const { tr } = useT();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [post, setPost] = useState<FeedPost | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);
  const body = useRef<HTMLDivElement>(null);
  const comments = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let off = false;
    fetch(`/api/posts/${id}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (!off && j?.post) setPost(j.post); }).catch(() => {});
    fetch(`/api/posts/${id}/view`, { method: "POST" }).catch(() => {});
    return () => { off = true; };
  }, [id, isAuthenticated]);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 260);
      const el = body.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight * 0.6;
      setProgress(Math.max(0, Math.min(1, total > 0 ? -r.top / total : 1)));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const back = () => (window.history.length > 1 ? router.back() : router.push("/"));
  const name = post ? post.author_name ?? shortAddress(post.author) : "";

  async function follow() {
    if (!post) return;
    if (!isAuthenticated) { window.dispatchEvent(new CustomEvent("open-wallet-connect")); return; }
    const r = await fetch("/api/follow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet: post.author }) }).catch(() => null);
    if (r?.ok) { const j = await r.json(); setPost((p) => (p ? { ...p, following_author: j.is_following } : p)); }
  }

  return (
    <div className="mx-auto max-w-2xl pb-48 md:pb-24 lg:border-x lg:border-border">
      {/* Titre fixé en haut pendant la lecture, avec la progression */}
      <div className={`fixed inset-x-0 top-16 z-30 transition-opacity lg:top-0 lg:left-auto lg:right-auto lg:mx-auto lg:max-w-2xl ${scrolled ? "opacity-100" : "pointer-events-none opacity-0"}`}>
        <div className="flex h-14 items-center gap-3 border-b border-border bg-background/95 px-3 backdrop-blur">
          <button onClick={back} aria-label={tr("Back")} className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-muted"><ArrowLeft className="size-5" /></button>
          <p className="truncate text-[15px] font-bold">{title}</p>
        </div>
        <div className="h-0.5 bg-[#a3e635]" style={{ width: `${progress * 100}%` }} />
      </div>

      <div className="relative">
        <button onClick={back} aria-label={tr("Back")} className="absolute left-3 top-3 z-10 flex size-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur"><ArrowLeft className="size-5" /></button>
        <ArticleCover src={cover} className="aspect-[2.2/1] max-h-[360px]" />
      </div>

      <div className="px-4 pt-5 md:px-6">
        <h1 className="text-[28px] font-extrabold leading-[1.15] tracking-tight text-foreground md:text-[34px]">{title}</h1>

        {post && (
          <div className="mt-4 flex items-center gap-3">
            <Link href={`/profile/${post.author}`} className="flex min-w-0 flex-1 items-center gap-3">
              {post.author_avatar
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={post.author_avatar} alt="" className="size-10 shrink-0 rounded-full object-cover" />
                : <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted font-bold">{name[0]?.toUpperCase()}</span>}
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-bold">{name}</span>
                <span className="block text-[13px] text-muted-foreground">{new Date(post.created_at).toLocaleDateString()}</span>
              </span>
            </Link>
            {!post.mine && (
              <button onClick={follow} className={`shrink-0 rounded-full border px-3.5 py-1 text-[12px] font-bold ${post.following_author ? "border-border text-muted-foreground" : "border-foreground text-foreground"}`}>
                {post.following_author ? tr("btn:Following") : tr("Follow")}
              </button>
            )}
          </div>
        )}
        <p className="mb-6 mt-3 flex items-center gap-1.5 text-[13px] text-muted-foreground"><BookOpen className="size-3.5" />{tr("{n} min read", { n: minutes })}</p>

        <div ref={body}><ArticleBody md={md} /></div>

        {/* Auteur en fin d'article */}
        {post && (
          <Link href={`/profile/${post.author}`} className="mt-12 flex items-center gap-3 border-t border-border pt-8">
            {post.author_avatar
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={post.author_avatar} alt="" className="size-[52px] shrink-0 rounded-full object-cover" />
              : <span className="flex size-[52px] shrink-0 items-center justify-center rounded-full bg-muted text-lg font-bold">{name[0]?.toUpperCase()}</span>}
            <span className="min-w-0">
              <span className="block truncate text-[17px] font-bold">{name}</span>
              <span className="block truncate text-[14px] text-muted-foreground">{shortAddress(post.author)}</span>
            </span>
          </Link>
        )}
      </div>

      <div ref={comments} className="mt-6 border-t border-border">
        <PostReplies postId={id} page onCount={(n) => setPost((p) => (p ? { ...p, reply_count: n } : p))} />
      </div>

      {post && <PostCard post={post} bar onComments={() => comments.current?.scrollIntoView({ behavior: "smooth" })} />}
    </div>
  );
}
