"use client";

/** Carte d'un article dans le fil : couverture, titre, début du texte. Un clic ouvre l'article complet. */
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { FeedPost } from "@/lib/social/posts";

export function ArticleCover({ src, className = "" }: { src: string | null; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className={`w-full bg-muted object-cover ${className}`} />
  ) : (
    <div className={`flex w-full items-center justify-center bg-[radial-gradient(120%_140%_at_85%_30%,#3b2a12_0%,#15110c_45%,#08070b_100%)] ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/omdot-icon.png" alt="" className="h-1/2 opacity-90" />
    </div>
  );
}

export function ArticleCard({ post }: { post: FeedPost }) {
  const { tr } = useT();
  const a = post.article!;
  return (
    <Link href={`/article/${post.id}`} className="mt-1 block overflow-hidden rounded-[18px] border border-border bg-card transition-colors hover:bg-muted/40">
      <ArticleCover src={a.cover_url} className="aspect-[2.6/1]" />
      <div className="px-3.5 pb-3.5 pt-3">
        <p className="text-[17px] font-extrabold leading-snug text-foreground">{a.title}</p>
        <p className="mt-1.5 line-clamp-3 text-[14px] leading-relaxed text-muted-foreground">{post.body}</p>
        <p className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-foreground"><BookOpen className="size-3" />{tr("Article")}</span>
          · {tr("{n} min read", { n: a.read_minutes })}
        </p>
      </div>
    </Link>
  );
}
