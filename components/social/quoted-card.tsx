"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";
import { shortAddress } from "@/lib/format";
import type { QuotedPost } from "@/lib/social/posts";

/** Post cité, en petit, à l'intérieur d'une citation. */
export function QuotedCard({ q, link = true }: { q: QuotedPost; link?: boolean }) {
  const { tr } = useT();
  const name = q.author_name ?? shortAddress(q.author);
  const body = (
    <>
      <div className="flex items-center gap-2">
        {q.author_avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={q.author_avatar} alt="" className="size-6 rounded-full object-cover" />
        ) : (
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">{name[0]?.toUpperCase()}</span>
        )}
        <span className="truncate text-sm font-bold text-foreground">{name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{new Date(q.created_at).toLocaleDateString([], { day: "numeric", month: "short" })}</span>
      </div>
      {q.body && <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap break-words text-[14px] leading-snug text-foreground">{q.body}</p>}
      {q.images[0] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={q.images[0]} alt="" loading="lazy" className="mt-2 max-h-56 w-full rounded-xl object-cover" />
      )}
      {!q.body && !q.images[0] && <p className="mt-1 text-sm text-muted-foreground">{tr("Post")}</p>}
    </>
  );
  const cls = "block rounded-2xl border border-border p-3";
  return link ? <Link href={`/post/${q.id}`} className={`${cls} transition-colors hover:bg-muted/40`}>{body}</Link> : <div className={cls}>{body}</div>;
}
