"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Heart, MessageCircle } from "lucide-react";
import type { MarketCommentEnriched } from "@/lib/supabase/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
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
    <div className="absolute bottom-full left-0 z-50 mb-1 flex w-56 flex-wrap gap-0.5 rounded-xl border border-border bg-card p-2 shadow-xl">
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
  const cls = size === "sm" ? "size-6" : "size-8";
  const initial = (user.username ?? user.wallet_address)?.[0]?.toUpperCase() ?? "?";
  return user.avatar_src ? (
    <img src={user.avatar_src} alt="" className={`${cls} shrink-0 rounded-full object-cover`} loading="lazy" />
  ) : (
    <div className={`${cls} shrink-0 flex items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-600 dark:bg-orange-950/40 dark:text-orange-400`}>
      {initial}
    </div>
  );
}

function CommentItem({ comment, marketId, isAuthenticated, onLike, onReply }: {
  comment: MarketCommentEnriched;
  marketId: string;
  isAuthenticated: boolean;
  onLike: (commentId: string, isReply: boolean) => void;
  onReply: (parentId: string, content: string) => Promise<void>;
}) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyText, setReplyText]         = useState("");
  const [replyPosting, setReplyPosting]   = useState(false);
  const [showEmoji, setShowEmoji]         = useState(false);
  const emojiRef = useRef<HTMLDivElement>(null);

  // suppress unused warning
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
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              {comment.username ?? shortAddr(comment.wallet_address)}
            </span>
            <span className="text-xs text-muted-foreground">{timeAgo(comment.created_at)}</span>
          </div>
          <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed break-words">{comment.content}</p>
          <div className="mt-1.5 flex items-center gap-4">
            <button type="button" onClick={() => onLike(comment.id, false)} disabled={!isAuthenticated}
              className={`flex items-center gap-1 text-xs transition-colors disabled:opacity-40 disabled:cursor-default ${comment.liked_by_me ? "text-orange-500" : "text-muted-foreground hover:text-orange-400"}`}>
              <Heart className={`size-3.5 ${comment.liked_by_me ? "fill-orange-500" : ""}`} />
              {comment.like_count > 0 && <span>{comment.like_count}</span>}
            </button>
            {isAuthenticated && (
              <button type="button" onClick={() => setShowReplyForm(v => !v)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-orange-400 transition-colors">
                <MessageCircle className="size-3.5" />
                Reply
              </button>
            )}
          </div>
        </div>
      </div>

      {comment.replies.length > 0 && (
        <div className="ml-11 mt-3 space-y-3 border-l-2 border-orange-100 pl-4 dark:border-orange-900/30">
          {comment.replies.map(reply => (
            <div key={reply.id} className="flex gap-3">
              <CommentAvatar user={reply} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    {reply.username ?? shortAddr(reply.wallet_address)}
                  </span>
                  <span className="text-xs text-muted-foreground">{timeAgo(reply.created_at)}</span>
                </div>
                <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed break-words">{reply.content}</p>
                <button type="button" onClick={() => onLike(reply.id, true)} disabled={!isAuthenticated}
                  className={`mt-1 flex items-center gap-1 text-xs transition-colors disabled:opacity-40 disabled:cursor-default ${reply.liked_by_me ? "text-orange-500" : "text-muted-foreground hover:text-orange-400"}`}>
                  <Heart className={`size-3.5 ${reply.liked_by_me ? "fill-orange-500" : ""}`} />
                  {reply.like_count > 0 && <span>{reply.like_count}</span>}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showReplyForm && isAuthenticated && (
        <div className="ml-11 mt-3 flex gap-2">
          <div className="relative flex-1">
            <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void submitReply(); }}
              placeholder="Write a reply..." rows={2} maxLength={1000} disabled={replyPosting}
              className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2 pb-8 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-orange-400/40 disabled:opacity-50" />
            <div className="absolute bottom-2 left-2" ref={emojiRef}>
              <button type="button" onClick={() => setShowEmoji(v => !v)}
                className="text-base leading-none opacity-50 hover:opacity-100 transition-opacity" aria-label="Add emoji">😊</button>
              {showEmoji && <EmojiPicker onSelect={e => { setReplyText(t => t + e); setShowEmoji(false); }} />}
            </div>
          </div>
          <div className="self-end flex flex-col gap-1.5">
            <button onClick={() => void submitReply()} disabled={!replyText.trim() || replyPosting}
              className="rounded-xl bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {replyPosting ? "..." : "Reply"}
            </button>
            <button onClick={() => { setShowReplyForm(false); setReplyText(""); }}
              className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function CommentsSection({ marketId, initialComments, isAuthenticated, apiBase = "/api/markets" }: {
  marketId: string;
  initialComments: MarketCommentEnriched[];
  isAuthenticated: boolean;
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
    if (!trimmed || !isAuthenticated) return;
    setPosting(true);
    try {
      const res = await fetch(`${apiBase}/${marketId}/comments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });
      const data = await res.json() as MarketCommentEnriched;
      if (!res.ok) throw new Error();
      setComments(prev => [{ ...data, like_count: 0, liked_by_me: false, replies: [] }, ...prev]);
      setText("");
    } catch {
      toast.error("Failed to post comment");
    } finally {
      setPosting(false);
    }
  }

  function handleLike(commentId: string, isReply: boolean, parentId?: string) {
    if (!isAuthenticated) return;
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
    fetch(`${apiBase}/${marketId}/comments/like`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment_id: commentId }),
    }).catch(() => setComments(prev => prev.map(toggle)));
  }

  async function handleReply(parentId: string, content: string) {
    const res = await fetch(`${apiBase}/${marketId}/comments`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, parent_id: parentId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Error");
    setComments(prev => prev.map(c =>
      c.id === parentId ? { ...c, replies: [...c.replies, { ...data, like_count: 0, liked_by_me: false, replies: [] }] } : c
    ));
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        Comments {totalCount > 0 && `(${totalCount})`}
      </h2>

      {isAuthenticated ? (
        <div className="mb-5 flex gap-2">
          <div className="relative flex-1">
            <textarea value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void postComment(); }}
              placeholder="Share your analysis..." disabled={posting} rows={2} maxLength={1000}
              className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2 pb-8 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-orange-400/40 disabled:opacity-50" />
            <div className="absolute bottom-2 left-2" ref={emojiRef}>
              <button type="button" onClick={() => setShowEmoji(v => !v)}
                className="text-base leading-none opacity-50 hover:opacity-100 transition-opacity" aria-label="Add emoji">😊</button>
              {showEmoji && <EmojiPicker onSelect={e => { setText(t => t + e); setShowEmoji(false); }} />}
            </div>
            {text.length > 800 && (
              <span className="absolute bottom-2 right-2 text-xs text-muted-foreground">{text.length}/1000</span>
            )}
          </div>
          <button onClick={() => void postComment()} disabled={!text.trim() || posting}
            className="self-end rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {posting ? "..." : "Post"}
          </button>
        </div>
      ) : (
        <div className="mb-5 rounded-xl border border-dashed border-border px-4 py-3 text-center text-sm text-muted-foreground">
          Connect your wallet to comment
        </div>
      )}

      {comments.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No comments yet — be the first!</p>
      ) : (
        <div className="space-y-5">
          {comments.map(c => (
            <CommentItem key={c.id} comment={c} marketId={marketId} isAuthenticated={isAuthenticated}
              onLike={(id, isReply) => handleLike(id, isReply, c.id)}
              onReply={handleReply} />
          ))}
        </div>
      )}
    </section>
  );
}
