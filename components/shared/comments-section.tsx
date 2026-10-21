"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Heart, MessageCircle } from "lucide-react";
import type { MarketCommentEnriched } from "@/lib/supabase/types";
import { OctoBadge } from "@/components/leaderboard/octo-tier-badge";
import { TokenPill } from "@/components/social/token-pill";
import { useQuery } from "@tanstack/react-query";
import { getWalletProfile } from "@/services/wallet-service";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useT } from "@/lib/i18n";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string, tr: (s: string, v?: Record<string, string | number>) => string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return tr("just now");
  if (diff < 3600)  return tr("{n} min ago", { n: Math.floor(diff / 60) });
  if (diff < 86400) return tr("{n} h ago", { n: Math.floor(diff / 3600) });
  return tr("{n} d ago", { n: Math.floor(diff / 86400) });
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 5)}...${addr.slice(-4)}`;
}



function CommentAvatar({ user, size = "md" }: {
  user: { avatar_src: string | null; username: string | null; wallet_address: string };
  size?: "sm" | "md";
}) {
  const cls = size === "sm" ? "size-9" : "size-11";
  const initial = (user.username ?? user.wallet_address)?.[0]?.toUpperCase() ?? "?";
  return user.avatar_src ? (
    <img src={user.avatar_src} alt="" className={`${cls} shrink-0 rounded-full object-cover`} loading="lazy" />
  ) : (
    <div className={`${cls} shrink-0 flex items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground`}>
      {initial}
    </div>
  );
}

function CommentItem({ comment, marketId, isAuthenticated, onLike, onReply, onRequestConnect }: {
  comment: MarketCommentEnriched;
  marketId: string;
  isAuthenticated: boolean;
  onLike: (commentId: string, isReply: boolean) => void;
  onReply: (parentId: string, content: string) => Promise<void>;
  onRequestConnect?: () => void;
}) {
  const { tr } = useT();
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyText, setReplyText]         = useState("");
  const [replyPosting, setReplyPosting]   = useState(false);

  void marketId;


  async function submitReply() {
    const trimmed = replyText.trim();
    if (!trimmed) return;
    setReplyPosting(true);
    try {
      await onReply(comment.id, trimmed);
      setReplyText("");
      setShowReplyForm(false);
    } catch {
      toast.error(tr("Failed to post reply"));
    } finally {
      setReplyPosting(false);
    }
  }

  return (
    <div>
      <div className="flex gap-3">
        <CommentAvatar user={comment} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className="text-[15px] font-semibold text-foreground">
              {comment.username ?? shortAddr(comment.wallet_address)}
            </span>
            {comment.octo_balance > 0 && <OctoBadge totalOcto={comment.octo_balance} size={14} />}
            <TokenPill token={comment.featured_token} size={15} />
            <span className="text-sm text-muted-foreground">· {timeAgo(comment.created_at, tr)}</span>
          </div>
          <p className="mt-1 whitespace-pre-line break-words text-[15px] leading-relaxed text-foreground">{comment.content}</p>
          <div className="mt-2.5 flex items-center gap-12">
            <button type="button" aria-label={tr("Reply")} onClick={() => { if (!isAuthenticated) { onRequestConnect?.(); return; } setShowReplyForm(v => !v); }}
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
              <MessageCircle className="size-5" />
              {comment.replies.length > 0 && <span className="num">{comment.replies.length}</span>}
            </button>
            <button type="button" aria-label={tr("Like")} onClick={() => onLike(comment.id, false)}
              className={`flex items-center gap-1.5 text-sm transition-colors ${comment.liked_by_me ? "text-down" : "text-muted-foreground hover:text-foreground"}`}>
              <Heart className={`size-5 ${comment.liked_by_me ? "fill-current" : ""}`} />
              {comment.like_count > 0 && <span className="num">{comment.like_count}</span>}
            </button>
          </div>
        </div>
      </div>

      {comment.replies.length > 0 && (
        <div className="ml-14 mt-4 space-y-4">
          {comment.replies.map(reply => (
            <div key={reply.id} className="flex gap-3">
              <CommentAvatar user={reply} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="text-[15px] font-semibold text-foreground">
                    {reply.username ?? shortAddr(reply.wallet_address)}
                  </span>
                  {reply.octo_balance > 0 && <OctoBadge totalOcto={reply.octo_balance} size={14} />}
                  <TokenPill token={reply.featured_token} size={15} />
                  <span className="text-sm text-muted-foreground">· {timeAgo(reply.created_at, tr)}</span>
                </div>
                <p className="mt-1 whitespace-pre-line break-words text-[15px] leading-relaxed text-foreground">{reply.content}</p>
                <button type="button" aria-label={tr("Like")} onClick={() => onLike(reply.id, true)}
                  className={`mt-2 flex items-center gap-1.5 text-sm transition-colors ${reply.liked_by_me ? "text-down" : "text-muted-foreground hover:text-foreground"}`}>
                  <Heart className={`size-5 ${reply.liked_by_me ? "fill-current" : ""}`} />
                  {reply.like_count > 0 && <span className="num">{reply.like_count}</span>}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showReplyForm && (
        <div className="ml-14 mt-3 flex gap-2">
          <div className="relative flex-1">
            <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void submitReply(); }}
              placeholder={tr("Write a reply...")} rows={2} maxLength={1000} disabled={replyPosting}
              className="w-full resize-none rounded-2xl bg-muted px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none disabled:opacity-50" />
          </div>
          <div className="self-end flex flex-col gap-1.5">
            <button onClick={() => void submitReply()} disabled={!replyText.trim() || replyPosting}
              className="rounded-full bg-foreground px-4 py-2 text-xs font-bold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
              {replyPosting ? "..." : tr("Reply")}
            </button>
            <button onClick={() => { setShowReplyForm(false); setReplyText(""); }}
              className="rounded-full px-4 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted">
              {tr("Cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function CommentsSection({ marketId, initialComments, isAuthenticated, walletAddress, onRequestConnect, apiBase = "/api/markets" }: {
  marketId: string;
  initialComments: MarketCommentEnriched[];
  isAuthenticated: boolean;
  walletAddress?: string | null;
  onRequestConnect?: () => void;
  apiBase?: string;
}) {
  const { tr } = useT();
  const [comments, setComments] = useState<MarketCommentEnriched[]>(initialComments);
  const [text, setText]         = useState("");
  const [posting, setPosting]   = useState(false);

  const totalCount = comments.reduce((n, c) => n + 1 + c.replies.length, 0);


  async function postComment() {
    const trimmed = text.trim();
    if (!isAuthenticated) { onRequestConnect?.(); return; }
    if (!trimmed) return;
    setPosting(true);
    try {
      const res = await fetch(`${apiBase}/${marketId}/comments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed, wallet_address: walletAddress }),
      });
      const data = await res.json() as MarketCommentEnriched & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setComments(prev => [{ ...data, like_count: 0, liked_by_me: false, replies: [] }, ...prev]);
      setText("");
    } catch (err) {
      toast.error(tr(err instanceof Error ? err.message : "Failed to post comment"));
    } finally {
      setPosting(false);
    }
  }

  function handleLike(commentId: string, isReply: boolean, parentId?: string) {
    if (!isAuthenticated) { onRequestConnect?.(); return; }
    // Optimistic update
    function toggle(c: MarketCommentEnriched): MarketCommentEnriched {
      if (!isReply && c.id === commentId)
        return { ...c, liked_by_me: !c.liked_by_me, like_count: c.liked_by_me ? c.like_count - 1 : c.like_count + 1 };
      if (isReply && c.id === parentId)
        return { ...c, replies: c.replies.map(r => r.id === commentId
          ? { ...r, liked_by_me: !r.liked_by_me, like_count: r.liked_by_me ? r.like_count - 1 : r.like_count + 1 }
          : r) };
      return c;
    }
    setComments(prev => prev.map(toggle));
    // Sync with server — use actual like_count from DB
    fetch(`${apiBase}/${marketId}/comments/like`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment_id: commentId, wallet_address: walletAddress }),
    })
      .then(async res => {
        if (!res.ok) { setComments(prev => prev.map(toggle)); return; }
        const data = await res.json() as { liked: boolean; like_count: number };
        // Apply server-confirmed like_count
        setComments(prev => prev.map(c => {
          if (!isReply && c.id === commentId)
            return { ...c, liked_by_me: data.liked, like_count: data.like_count };
          if (isReply && c.id === parentId)
            return { ...c, replies: c.replies.map(r =>
              r.id === commentId ? { ...r, liked_by_me: data.liked, like_count: data.like_count } : r
            )};
          return c;
        }));
      })
      .catch(() => setComments(prev => prev.map(toggle)));
  }

  async function handleReply(parentId: string, content: string) {
    const res = await fetch(`${apiBase}/${marketId}/comments`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, parent_id: parentId, wallet_address: walletAddress }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Error");
    setComments(prev => prev.map(c =>
      c.id === parentId ? { ...c, replies: [...c.replies, { ...data, like_count: 0, liked_by_me: false, replies: [] }] } : c
    ));
  }

  const [focused, setFocused] = useState(false);
  const open = focused || text.length > 0;
  const me = walletAddress ?? "";
  const { data: myProfile } = useQuery({
    queryKey: ["wallet-profile", me],
    queryFn: () => getWalletProfile(me),
    enabled: !!me,
    staleTime: 60_000,
  });
  const myName = myProfile?.display_name || myProfile?.username || me || "?";

  return (
    <section>
      <h2 className="mb-4 text-xl font-bold tracking-tight text-foreground">
        {tr("Comments")} {totalCount > 0 && <span className="text-muted-foreground">{totalCount}</span>}
      </h2>

      {/* Composer */}
      <div className="mb-6 flex items-start gap-3">
        <UserAvatar src={myProfile?.avatar_src} name={myName} size={44} />
        <div className="min-w-0 flex-1">
          <div className="relative">
            <textarea value={text} onChange={e => setText(e.target.value)}
              onFocus={() => { if (!isAuthenticated) { onRequestConnect?.(); return; } setFocused(true); }}
              onBlur={() => setFocused(false)}
              onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void postComment(); }}
              placeholder={tr("Join discussion")} disabled={posting} rows={open ? 3 : 1} maxLength={1000}
              className={`w-full resize-none bg-muted px-4 text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 ${open ? "rounded-2xl py-3" : "rounded-full py-3"}`} />
            {text.length > 800 && (
              <span className="absolute bottom-2.5 right-3 text-xs text-muted-foreground">{text.length}/1000</span>
            )}
          </div>
          {open && (
            <div className="mt-2 flex justify-end">
              <button onMouseDown={e => e.preventDefault()} onClick={() => void postComment()} disabled={posting || !text.trim()}
                className="rounded-full bg-foreground px-5 py-2 text-sm font-bold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
                {posting ? "..." : tr("Post")}
              </button>
            </div>
          )}
        </div>
      </div>

      {comments.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{tr("No comments yet. Be the first!")}</p>
      ) : (
        <div className="space-y-7">
          {comments.map(c => (
            <CommentItem key={c.id} comment={c} marketId={marketId} isAuthenticated={isAuthenticated}
              onLike={(id, isReply) => handleLike(id, isReply, c.id)}
              onReply={handleReply}
              onRequestConnect={onRequestConnect} />
          ))}
        </div>
      )}
    </section>
  );
}
