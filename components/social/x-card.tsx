"use client";

import { useEffect, useState } from "react";
import { Play } from "lucide-react";

type Info = { author?: string; text?: string | null; media?: { type: "photo" | "video" | "gif"; url: string } | null };

/** Aperçu d'un post X collé dans un post OM : média (image, vidéo, GIF), auteur et texte. Un clic ouvre X. */
export function XCard({ handle, id, url }: { handle: string; id: string; url: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    let off = false;
    fetch(`/api/x-embed?handle=${encodeURIComponent(handle)}&id=${id}`)
      .then((r) => r.json()).then((j) => { if (!off) setInfo(j); }).catch(() => {});
    return () => { off = true; };
  }, [handle, id]);
  const media = info?.media && !bad ? info.media : null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => e.stopPropagation()}
      className="block overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:bg-muted/60">
      {media && (
        <div className="relative bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={media.url} alt="" loading="lazy" onError={() => setBad(true)} className="max-h-[420px] w-full object-cover" />
          {media.type !== "photo" && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-black/60 text-white">
                {media.type === "video" ? <Play className="size-7 fill-white" /> : <span className="text-sm font-bold">GIF</span>}
              </span>
            </span>
          )}
        </div>
      )}
      <div className="p-3">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
          <svg viewBox="0 0 24 24" className="size-4 shrink-0 fill-foreground" aria-hidden><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
          <span className="truncate text-foreground">{info?.author ?? `@${handle}`}</span>
          <span className="truncate">@{handle}</span>
        </div>
        {info?.text && <p className="mt-2 line-clamp-6 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-foreground">{info.text}</p>}
      </div>
    </a>
  );
}
