"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Heart, MessageCircle } from "lucide-react";
import type { MarketCommentEnriched } from "@/lib/supabase/types";
import { OctoBadge } from "@/components/leaderboard/octo-tier-badge";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 5)}...${addr.slice(-4)}`;
}

const EMOJI_LIST = [
  "😀","😂","🤣","😍","🥳","🤔","😮","😎","🙏","💪",
  "🔥","💯","🚀","🎉","💰","📈","📉","⚡","🎯","✅",
  "❌","⚠️","👀","👍","👎","🤝","💡","🏆","🥇","😱",
  "🤯","💸","🐙","🌊","🦾","🧠","👻","❤️","💎","🎱",
];

function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  return (
    <div onMouseDown={(e) => e.preventDefault()} className="absolute bottom-full left-0 z-50 mb-1 flex w-56 flex-wrap gap-0.5 rounded-xl border border-border bg-card p-2 shadow-xl">
      {EMOJI_LIST.map((e) => (
        <button key={e} type="button" onClick={() => onSelect(e)}
          className="rounded p-1 text-lg leading-none transition-colors hover:bg-muted">
          {e}
        </button>
      ))}
    </div>
  );
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
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyText, setReplyText]         = useState("");
  const [replyPosting, setReplyPosting]   = useState(false);
  const [showEmoji, setShowEmoji]         = useState(false);
  const emojiRef = useRef<HTMLDivElement>(null);

  void marketId;

  useEffect(() => {
    if (!showEmoji) return;
    function h(e: MouseEvent) {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setShowEmoji(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showEmoji]);

  async function submitReply() {
    const trimmed = replyText.trim();
    if (!trimmed) return;
    setReplyPosting(true);
    try {
      await onReply(comment.id, trimmed);
      setReplyText("");
      setShowReplyForm(false);
    } catch {
      toast.error("Failed to post reply");
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
            {comment.octo_balance > 0 && <OctoBadge totalOcto={comment.octo_balance} size={12} />}
            <span className="text-sm text-muted-foreground">· {timeAgo(comment.created_at)}</span>
          </div>
          <p className="mt-1 break-words text-[15px] leading-relaxed text-foreground">{comment.content}</p>
          <div className="mt-2.5 flex items-center gap-12">
            <button type="button" aria-label="Reply" onClick={() => { if (!isAuthenticated) { onRequestConnect?.(); return; } setShowReplyForm(v => !v); }}
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
              <MessageCircle className="size-5" />
              {comment.replies.length > 0 && <span className="num">{comment.replies.length}</span>}
            </button>
            <button type="button" aria-label="Like" onClick={() => onLike(comment.id, false)}
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
                  {reply.octo_balance > 0 && <OctoBadge totalOcto={reply.octo_balance} size={12} />}
                  <span className="text-sm text-muted-foreground">· {timeAgo(reply.created_at)}</span>
                </div>
                <p className="mt-1 break-words text-[15px] leading-relaxed text-foreground">{reply.content}</p>
                <button type="button" aria-label="Like" onClick={() => onLike(reply.id, true)}
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
              placeholder="Write a reply..." rows={2} maxLength={1000} disabled={replyPosting}
              className="w-full resize-none rounded-2xl bg-muted px-4 py-2.5 pb-8 text-sm placeholder:text-muted-foreground focus:outline-none disabled:opacity-50" />
            <div className="absolute bottom-2 left-3" ref={emojiRef}>
              <button type="button" onClick={() => setShowEmoji(v => !v)}
                className="text-base leading-none opacity-50 hover:opacity-100 transition-opacity" aria-label="Add emoji">😊</button>
              {showEmoji && <EmojiPicker onSelect={e => { setReplyText(t => t + e); setShowEmoji(false); }} />}
            </div>
          </div>
          <div className="self-end flex flex-col gap-1.5">
            <button onClick={() => void submitReply()} disabled={!replyText.trim() || replyPosting}
              className="rounded-full bg-foreground px-4 py-2 text-xs font-bold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
              {replyPosting ? "..." : "Reply"}
            </button>
            <button onClick={() => { setShowReplyForm(false); setReplyText(""); }}
              className="rounded-full px-4 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted">
              Cancel
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
  const [comments, setComments] = useState<MarketCommentEnriched[]>(initialComments);
  const [text, setText]         = useState("");
  const [posting, setPosting]   = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const emojiRef = useRef<HTMLDivElement>(null);

  const totalCount = comments.reduce((n, c) => n + 1 + c.replies.length, 0);

  useEffect(() => {
    if (!showEmoji) return;
    function h(e: MouseEvent) {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setShowEmoji(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showEmoji]);

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
      toast.error(err instanceof Error ? err.message : "Failed to post comment");
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

  return (
    <section>
      <h2 className="mb-4 text-xl font-bold tracking-tight text-foreground">
        Comments {totalCount > 0 && <span className="text-muted-foreground">{totalCount}</span>}
      </h2>

      {/* Composer */}
      <div className="mb-6 flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground">
          {me ? me[0].toUpperCase() : "?"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative">
            <textarea value={text} onChange={e => setText(e.target.value)}
              onFocus={() => { if (!isAuthenticated) { onRequestConnect?.(); return; } setFocused(true); }}
              onBlur={() => setFocused(false)}
              onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void postComment(); }}
              placeholder="Join discussion" disabled={posting} rows={open ? 3 : 1} maxLength={1000}
              className={`w-full resize-none bg-muted px-4 text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 ${open ? "rounded-2xl py-3 pb-9" : "rounded-full py-3"}`} />
            {open && (
              <div className="absolute bottom-2.5 left-3" ref={emojiRef}>
                <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setShowEmoji(v => !v)}
                  className="text-base leading-none opacity-60 transition-opacity hover:opacity-100" aria-label="Add emoji">😊</button>
                {showEmoji && <EmojiPicker onSelect={e => { setText(t => t + e); setShowEmoji(false); }} />}
              </div>
            )}
            {text.length > 800 && (
              <span className="absolute bottom-2.5 right-3 text-xs text-muted-foreground">{text.length}/1000</span>
            )}
          </div>
          {open && (
            <div className="mt-2 flex justify-end">
              <button onMouseDown={e => e.preventDefault()} onClick={() => void postComment()} disabled={posting || !text.trim()}
                className="rounded-full bg-foreground px-5 py-2 text-sm font-bold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
                {posting ? "..." : "Post"}
              </button>
            </div>
          )}
        </div>
      </div>

      {comments.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No comments yet. Be the first!</p>
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
