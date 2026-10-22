"use client";

import { TokenPill } from "./token-pill";
import type { FeaturedToken } from "@/lib/social/featured-token";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { shortAddress } from "@/lib/format";
import { OctoBadge } from "@/components/leaderboard/octo-tier-badge";

type Reply = { id: string; author: string; author_name: string | null; author_avatar: string | null; author_token?: FeaturedToken | null; author_octo?: number; body: string; created_at: string };

/** « Les plus pertinentes » : comptes vérifiés (1 000 OMERO et plus) d'abord, puis dans l'ordre. */
export function sortReplies<T extends { author_octo?: number; created_at: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => Number((b.author_octo ?? 0) >= 1000) - Number((a.author_octo ?? 0) >= 1000) || a.created_at.localeCompare(b.created_at));
}

export function PostReplies({ postId, onCount, page = false }: { postId: string; onCount: (n: number) => void; page?: boolean }) {
  const { tr } = useT();
  const { isAuthenticated } = useAuth();
  const [list, setList] = useState<Reply[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const load = () =>
    fetch(`/api/posts/${postId}/replies`).then((r) => r.json()).then((j) => { setList(sortReplies(j.replies ?? [])); onCount((j.replies ?? []).length); }).catch(() => setList([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [postId]);

  async function send() {
    if (!isAuthenticated) { window.dispatchEvent(new CustomEvent("open-wallet-connect")); return; }
    if (!text.trim()) return;
    setSending(true);
    const r = await fetch(`/api/posts/${postId}/replies`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text }) });
    setSending(false);
    if (r.ok) { setText(""); load(); } else toast.error(tr((await r.json().catch(() => ({}))).error ?? "Something went wrong"));
  }

  const bar = (
      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          maxLength={1000}
          placeholder={tr(page ? "Post your reply" : "Write a reply")}
          className={`min-w-0 flex-1 rounded-full px-4 text-sm outline-none ${page ? "h-11 bg-muted" : "border border-border bg-transparent py-2 focus:border-foreground/40"}`}
        />
        <button onClick={send} disabled={sending || !text.trim()} aria-label={tr("Send")} className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-40">
          <Send className="size-4" />
        </button>
      </div>
  );

  // Page d'un post : réponses triées, barre de réponse collée en bas de l'écran
  if (page) return (
    <div>
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5 text-sm font-bold">
        <span>{tr("Most relevant")}</span>
        <span className="font-semibold text-muted-foreground">{list ? list.length : ""} {tr(list?.length === 1 ? "reply" : "replies")}</span>
      </div>
      {list === null && <div className="m-4 h-12 animate-pulse rounded-xl bg-muted/30" />}
      {list?.length === 0 && <p className="px-6 py-10 text-center text-sm text-muted-foreground">{tr("No replies yet. Be the first.")}</p>}
      {list?.map((r) => (
        <div key={r.id} className="flex gap-3 border-b border-border px-4 py-3">
          <Link href={`/profile/${r.author}`} className="shrink-0">
            {r.author_avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.author_avatar} alt="" className="size-10 rounded-full object-cover" />
            ) : (
              <div className="flex size-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">{(r.author_name ?? r.author)[0]?.toUpperCase()}</div>
            )}
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Link href={`/profile/${r.author}`} className="text-[14px] font-bold text-foreground">{r.author_name ?? shortAddress(r.author)}</Link>
              <OctoBadge totalOcto={r.author_octo ?? 0} size={14} />
              <TokenPill token={r.author_token} size={14} />
            </div>
            <p className="whitespace-pre-wrap break-words text-[15px] text-foreground">{r.body}</p>
          </div>
        </div>
      ))}
      <div className="sticky bottom-24 z-20 border-t border-border bg-background/95 px-3 py-2.5 backdrop-blur md:bottom-0">{bar}</div>
    </div>
  );

  return (
    <div className="mt-3 space-y-3 border-t border-border px-1 pt-3">
      {list === null && <div className="h-10 animate-pulse rounded-xl bg-muted/30" />}
      {list?.map((r) => (
        <div key={r.id} className="flex gap-2.5">
          {r.author_avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.author_avatar} alt="" className="size-8 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">{(r.author_name ?? r.author)[0]?.toUpperCase()}</div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Link href={`/profile/${r.author}`} className="text-[13px] font-bold text-foreground">{r.author_name ?? shortAddress(r.author)}</Link>
              <OctoBadge totalOcto={r.author_octo ?? 0} size={13} />
              <TokenPill token={r.author_token} size={13} />
            </div>
            <p className="whitespace-pre-wrap break-words text-sm text-foreground">{r.body}</p>
          </div>
        </div>
      ))}
      {bar}
    </div>
  );
}
