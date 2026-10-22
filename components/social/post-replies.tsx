"use client";

import { TokenPill } from "./token-pill";
import type { FeaturedToken } from "@/lib/social/featured-token";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Heart, MessageCircle, Send, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { shortAddress } from "@/lib/format";
import { OctoBadge } from "@/components/leaderboard/octo-tier-badge";
import { buildThreads } from "@/lib/social/reply-threads";
export { sortReplies, buildThreads } from "@/lib/social/reply-threads";

type Reply = {
  id: string; author: string; author_name: string | null; author_avatar: string | null; author_token?: FeaturedToken | null; author_octo?: number;
  body: string; created_at: string; parent_id?: string | null; parent_author?: string | null; parent_author_name?: string | null;
  like_count?: number; reply_count?: number; liked_by_me?: boolean;
};


export function PostReplies({ postId, onCount, page = false }: { postId: string; onCount: (n: number) => void; page?: boolean }) {
  const { tr } = useT();
  const { isAuthenticated } = useAuth();
  const [list, setList] = useState<Reply[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Reply | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const load = () =>
    fetch(`/api/posts/${postId}/replies`).then((r) => r.json()).then((j) => { setList(j.replies ?? []); onCount((j.replies ?? []).length); }).catch(() => setList([]));

  function startReply(r: Reply) {
    if (!isAuthenticated) { window.dispatchEvent(new CustomEvent("open-wallet-connect")); return; }
    setReplyTo(r);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function toggleLike(r: Reply) {
    if (!isAuthenticated) { window.dispatchEvent(new CustomEvent("open-wallet-connect")); return; }
    const was = !!r.liked_by_me;
    const patch = (liked: boolean, n: number) => setList((l) => l?.map((x) => (x.id === r.id ? { ...x, liked_by_me: liked, like_count: n } : x)) ?? l);
    patch(!was, Math.max(0, (r.like_count ?? 0) + (was ? -1 : 1)));
    const res = await fetch(`/api/posts/${postId}/replies/${r.id}/like`, { method: "POST" }).catch(() => null);
    if (res?.ok) { const j = await res.json(); patch(j.liked, j.like_count); }
    else patch(was, r.like_count ?? 0);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [postId]);

  async function send() {
    if (!isAuthenticated) { window.dispatchEvent(new CustomEvent("open-wallet-connect")); return; }
    if (!text.trim()) return;
    setSending(true);
    const r = await fetch(`/api/posts/${postId}/replies`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text, parent_id: replyTo?.id }) });
    setSending(false);
    if (r.ok) {
      if (replyTo) { const t = list?.find((x) => x.id === replyTo.id); const root = t ? buildThreads(list ?? []).find((th) => th.root.id === t.id || th.children.some((c) => c.id === t.id))?.root.id : null; if (root) setOpen((o) => new Set(o).add(root)); }
      setText(""); setReplyTo(null); load();
    } else toast.error(tr((await r.json().catch(() => ({}))).error ?? "Something went wrong"));
  }

  const name = (r: Reply) => r.author_name ?? shortAddress(r.author);
  const bar = (
    <div>
      {replyTo && (
        <div className="mb-1.5 flex items-center gap-1 px-1 text-xs text-muted-foreground">
          <span className="truncate">{tr("Replying to")} <span className="font-semibold text-foreground">@{name(replyTo)}</span></span>
          <button onClick={() => setReplyTo(null)} aria-label={tr("Cancel")} className="ml-auto shrink-0 p-0.5 hover:text-foreground"><X className="size-3.5" /></button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); else if (e.key === "Escape") setReplyTo(null); }}
          maxLength={1000}
          placeholder={tr(page ? "Post your reply" : "Write a reply")}
          className={`min-w-0 flex-1 rounded-full px-4 text-sm outline-none ${page ? "h-11 bg-muted" : "border border-border bg-transparent py-2 focus:border-foreground/40"}`}
        />
        <button onClick={send} disabled={sending || !text.trim()} aria-label={tr("Send")} className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-40">
          <Send className="size-4" />
        </button>
      </div>
    </div>
  );

  // Actions d'une réponse : répondre et liker, avec compteurs
  const actions = (r: Reply) => (
    <div className="mt-1 flex items-center gap-5 text-muted-foreground">
      <button onClick={() => startReply(r)} aria-label={tr("Reply")} className="flex items-center gap-1 text-xs hover:text-foreground">
        <MessageCircle className="size-[15px]" strokeWidth={1.9} />
        {(r.reply_count ?? 0) > 0 && <span>{r.reply_count}</span>}
      </button>
      <button onClick={() => toggleLike(r)} aria-label={tr("Like")} aria-pressed={!!r.liked_by_me} className={`flex items-center gap-1 text-xs ${r.liked_by_me ? "text-[#f43f5e]" : "hover:text-foreground"}`}>
        <Heart className={`size-[15px] ${r.liked_by_me ? "fill-[#f43f5e]" : ""}`} strokeWidth={r.liked_by_me ? 0 : 1.9} />
        {(r.like_count ?? 0) > 0 && <span>{r.like_count}</span>}
      </button>
    </div>
  );
  // « Replying to @x » pour une réponse à une réponse
  const replyingTo = (r: Reply) =>
    r.parent_author ? (
      <p className="text-xs text-muted-foreground">{tr("Replying to")} <Link href={`/profile/${r.parent_author}`} className="text-foreground/80 hover:underline">@{r.parent_author_name ?? shortAddress(r.parent_author)}</Link></p>
    ) : null;

  const threads = list ? buildThreads(list) : null;
  // Réponses imbriquées : les 2 premières visibles, le reste derrière « Show more replies »
  const visibleChildren = (rootId: string, children: Reply[]) => (open.has(rootId) ? children : children.slice(0, 2));
  const moreBtn = (rootId: string, children: Reply[], cls: string) =>
    children.length > 2 && !open.has(rootId) ? (
      <button onClick={() => setOpen((o) => new Set(o).add(rootId))} className={`text-xs font-semibold text-muted-foreground hover:text-foreground ${cls}`}>
        {tr("Show more replies")} ({children.length - 2})
      </button>
    ) : null;

  // Page d'un post : réponses triées, barre de réponse collée en bas de l'écran
  if (page) return (
    <div>
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5 text-sm font-bold">
        <span>{tr("Most relevant")}</span>
        <span className="font-semibold text-muted-foreground">{list ? list.length : ""} {tr(list?.length === 1 ? "reply" : "replies")}</span>
      </div>
      {list === null && <div className="m-4 h-12 animate-pulse rounded-xl bg-muted/30" />}
      {list?.length === 0 && <p className="px-6 py-10 text-center text-sm text-muted-foreground">{tr("No replies yet. Be the first.")}</p>}
      {threads?.map(({ root, children }) => (
        <div key={root.id} className="border-b border-border">
          {[root, ...visibleChildren(root.id, children)].map((r) => {
            const child = r.id !== root.id;
            return (
              <div key={r.id} className={`flex gap-3 px-4 py-3 ${child ? "pl-[68px] pt-0" : ""}`}>
                <Link href={`/profile/${r.author}`} className="shrink-0">
                  {r.author_avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.author_avatar} alt="" className={`${child ? "size-8" : "size-10"} rounded-full object-cover`} />
                  ) : (
                    <div className={`flex ${child ? "size-8 text-xs" : "size-10 text-sm"} items-center justify-center rounded-full bg-primary font-bold text-white`}>{(r.author_name ?? r.author)[0]?.toUpperCase()}</div>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Link href={`/profile/${r.author}`} className="text-[14px] font-bold text-foreground">{name(r)}</Link>
                    <OctoBadge totalOcto={r.author_octo ?? 0} size={14} />
                    <TokenPill token={r.author_token} size={14} />
                  </div>
                  {child && replyingTo(r)}
                  <p className="whitespace-pre-wrap break-words text-[15px] text-foreground">{r.body}</p>
                  {actions(r)}
                </div>
              </div>
            );
          })}
          {moreBtn(root.id, children, "mb-3 ml-[68px]")}
        </div>
      ))}
      <div className="sticky bottom-24 z-20 border-t border-border bg-background/95 px-3 py-2.5 backdrop-blur md:bottom-0">{bar}</div>
    </div>
  );

  return (
    <div className="mt-3 space-y-3 border-t border-border px-1 pt-3">
      {list === null && <div className="h-10 animate-pulse rounded-xl bg-muted/30" />}
      {threads?.map(({ root, children }) => (
        <div key={root.id} className="space-y-3">
          {[root, ...visibleChildren(root.id, children)].map((r) => {
            const child = r.id !== root.id;
            return (
              <div key={r.id} className={`flex gap-2.5 ${child ? "pl-[42px]" : ""}`}>
                {r.author_avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.author_avatar} alt="" className={`${child ? "size-6" : "size-8"} shrink-0 rounded-full object-cover`} />
                ) : (
                  <div className={`flex ${child ? "size-6 text-[10px]" : "size-8 text-xs"} shrink-0 items-center justify-center rounded-full bg-primary font-bold text-white`}>{(r.author_name ?? r.author)[0]?.toUpperCase()}</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Link href={`/profile/${r.author}`} className="text-[13px] font-bold text-foreground">{name(r)}</Link>
                    <OctoBadge totalOcto={r.author_octo ?? 0} size={13} />
                    <TokenPill token={r.author_token} size={13} />
                  </div>
                  {child && replyingTo(r)}
                  <p className="whitespace-pre-wrap break-words text-sm text-foreground">{r.body}</p>
                  {actions(r)}
                </div>
              </div>
            );
          })}
          {moreBtn(root.id, children, "ml-[42px]")}
        </div>
      ))}
      {bar}
    </div>
  );
}
