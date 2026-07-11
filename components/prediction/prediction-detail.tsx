"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Check, Share2, Heart, MessageCircle } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { connectWalletAndAuth } from "@/lib/wallet/auth";
import { getAvailableWallets } from "@/lib/wallet/adapters";
import { WalletSelectDialog } from "@/components/wallet/wallet-select-dialog";
import { MarketCountdownBadge } from "@/components/market/market-countdown";
import {
  parseMarketOptions,
  type MarketOption,
} from "@/lib/market/utils";
import {
  submitBet,
  computeReward,
  MIN_STAKE_USDC,
  MAX_STAKE_USDC,
  MIN_STAKE_CLT,
} from "@/lib/market/betting";
import type { PredictionMarketRow, MarketCommentEnriched } from "@/lib/supabase/types";
import type { WalletType } from "@/lib/wallet/adapters";
import type { MarketVolumeDetail } from "@/services/prediction-service";
import { OctoBadge } from "@/components/leaderboard/octo-tier-badge";

// ─── Option Colors ────────────────────────────────────────────────────────────────────

const OPTION_COLORS = [
  { bar: "bg-blue-500",   border: "border-blue-500",   bg: "bg-blue-500",   text: "text-white", probText: "text-blue-100",   volText: "text-blue-200",   barBg: "bg-blue-400/40",   barFill: "bg-white/70", idle: "border-blue-200 bg-white hover:border-blue-300 hover:bg-blue-50 dark:border-blue-900/40 dark:bg-zinc-900 dark:hover:border-blue-700/60 dark:hover:bg-zinc-800" },
  { bar: "bg-red-500",    border: "border-red-500",    bg: "bg-red-500",    text: "text-white", probText: "text-red-100",    volText: "text-red-200",    barBg: "bg-red-400/40",    barFill: "bg-white/70", idle: "border-red-200 bg-white hover:border-red-300 hover:bg-red-50 dark:border-red-900/40 dark:bg-zinc-900 dark:hover:border-red-700/60 dark:hover:bg-zinc-800" },
  { bar: "bg-green-500",  border: "border-green-500",  bg: "bg-green-500",  text: "text-white", probText: "text-green-100",  volText: "text-green-200",  barBg: "bg-green-400/40",  barFill: "bg-white/70", idle: "border-green-200 bg-white hover:border-green-300 hover:bg-green-50 dark:border-green-900/40 dark:bg-zinc-900 dark:hover:border-green-700/60 dark:hover:bg-zinc-800" },
  { bar: "bg-orange-500", border: "border-orange-500", bg: "bg-orange-500", text: "text-white", probText: "text-orange-100", volText: "text-orange-200", barBg: "bg-orange-400/40", barFill: "bg-white/70", idle: "border-orange-200 bg-white hover:border-orange-300 hover:bg-orange-50 dark:border-orange-900/40 dark:bg-zinc-900 dark:hover:border-orange-700/60 dark:hover:bg-zinc-800" },
  { bar: "bg-purple-500", border: "border-purple-500", bg: "bg-purple-500", text: "text-white", probText: "text-purple-100", volText: "text-purple-200", barBg: "bg-purple-400/40", barFill: "bg-white/70", idle: "border-purple-200 bg-white hover:border-purple-300 hover:bg-purple-50 dark:border-purple-900/40 dark:bg-zinc-900 dark:hover:border-purple-700/60 dark:hover:bg-zinc-800" },
  { bar: "bg-yellow-500", border: "border-yellow-500", bg: "bg-yellow-500", text: "text-white", probText: "text-yellow-100", volText: "text-yellow-200", barBg: "bg-yellow-400/40", barFill: "bg-white/70", idle: "border-yellow-200 bg-white hover:border-yellow-300 hover:bg-yellow-50 dark:border-yellow-900/40 dark:bg-zinc-900 dark:hover:border-yellow-700/60 dark:hover:bg-zinc-800" },
];
function optionColor(index: number, label?: string) {
  const l = label?.trim().toLowerCase();
  if (l === "yes") return OPTION_COLORS[2]; // green
  if (l === "no")  return OPTION_COLORS[1]; // red
  return OPTION_COLORS[index % OPTION_COLORS.length];
}

// ─── Types ────────────────────────────────────────────────────────────────────────────

type BetToken = "usdc" | "clawdtrust";
type SubmitState = "idle" | "signing" | "submitting" | "success" | "error";

// ─── Quick-pick amounts ───────────────────────────────────────────────────────────

const QUICK_USDC = [5, 10, 25, 50];
const QUICK_CLT  = [500_000, 1_000_000, 2_000_000];

function formatCLT(n: number) {
  if (n >= 1_000_000) return `${n / 1_000_000}M`;
  if (n >= 1_000)     return `${n / 1_000}K`;
  return String(n);
}

function fmtVol(usdc: number, clt: number) {
  const parts: string[] = [];
  if (usdc > 0) parts.push(`$${usdc.toLocaleString("en-US", { maximumFractionDigits: 0 })} USDC`);
  if (clt > 0)  parts.push(`${(clt / 1_000_000).toFixed(1)}M CLT`);
  return parts.join(" · ") || "—";
}

// ─── Market status ───────────────────────────────────────────────────────────────

type MarketStatus = "open" | "live" | "resolved" | "closed";

function getMarketStatus(market: PredictionMarketRow): MarketStatus {
  if (market.is_resolved) return "resolved";
  if (!market.is_active)  return "closed";
  if (market.event_start_at && new Date(market.event_start_at) <= new Date()) return "live";
  return "open";
}

const STATUS_STYLES: Record<MarketStatus, { label: string; cls: string; dot?: boolean }> = {
  open:     { label: "Open",     cls: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/20 dark:text-emerald-400", dot: false },
  live:     { label: "Live",     cls: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/20 dark:text-emerald-400", dot: true  },
  resolved: { label: "Resolved", cls: "border-border bg-muted text-muted-foreground", dot: false },
  closed:   { label: "Closed",   cls: "border-border bg-muted text-muted-foreground", dot: false },
};

function StatusBadge({ market }: { market: PredictionMarketRow }) {
  const status = getMarketStatus(market);
  const { label, cls, dot } = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>
      {dot && (
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
        </span>
      )}
      {label}
    </span>
  );
}

// ─── Implied probability ──────────────────────────────────────────────────────────────

function computeProbabilities(options: MarketOption[]): number[] {
  const inverses = options.map((o) => 1 / o.oddsMultiplier);
  const total    = inverses.reduce((s, v) => s + v, 0);
  return inverses.map((v) => Math.round((v / total) * 100));
}

// ─── Share button ──────────────────────────────────────────────────────────────────

function ShareButton() {
  const [copied, setCopied] = useState(false);

  function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={handleShare}
      className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {copied ? <Check className="size-3.5 text-emerald-500" /> : <Share2 className="size-3.5" />}
      {copied ? "Copied!" : "Share"}
    </button>
  );
}

// ─── Market visual ────────────────────────────────────────────────────────────────

function MarketVisual({ market }: { market: PredictionMarketRow }) {
  if (market.visual_type === "vs") {
    return (
      <div className="flex items-center justify-center gap-4 py-2">
        <Competitor name={market.left_competitor_name}  src={market.left_competitor_image_src}  />
        <span className="text-lg font-black text-zinc-300 dark:text-zinc-600">VS</span>
        <Competitor name={market.right_competitor_name} src={market.right_competitor_image_src} />
      </div>
    );
  }
  if (market.visual_type === "simple" && market.single_name) {
    return (
      <div className="flex items-center gap-3 py-2">
        {market.single_image_src && (
          <img
            src={market.single_image_src}
            alt={market.single_name}
            className="size-10 rounded-full object-cover border border-orange-200 dark:border-orange-800/60"
            loading="lazy"
          />
        )}
        <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{market.single_name}</span>
      </div>
    );
  }
  return null;
}

function Competitor({ name, src }: { name: string | null; src: string | null }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      {src ? (
        <img src={src} alt={name ?? ""} className="size-12 rounded-full object-cover border border-orange-200 dark:border-orange-800/60" loading="lazy" />
      ) : (
        <div className="flex size-12 items-center justify-center rounded-full bg-orange-100 text-lg font-bold text-orange-600 dark:bg-orange-950/50 dark:text-orange-400">
          {name?.[0] ?? "?"}
        </div>
      )}
      <span className="text-xs font-semibold text-zinc-700 text-center max-w-[80px] truncate dark:text-zinc-300">{name}</span>
    </div>
  );
}

// ─── Reward summary ───────────────────────────────────────────────────────────────

function RewardSummary({
  amount,
  option,
  token,
}: {
  amount: number;
  option: MarketOption;
  token: BetToken;
}) {
  const reward = computeReward(amount, option.oddsMultiplier);

  const fmt = (n: number) =>
    token === "clawdtrust"
      ? `${n.toLocaleString("en-US")} ClawdTrust`
      : `$${n.toFixed(2)} USDC`;

  return (
    <div className="rounded-2xl border border-orange-200 bg-orange-50/60 px-4 py-3 space-y-2 text-sm dark:border-orange-900/50 dark:bg-orange-950/10">
      <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
        <span>Stake</span>
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{fmt(reward.stake)}</span>
      </div>
      <div className="flex justify-between text-zinc-500 text-xs dark:text-zinc-500">
        <span>Reserve fee (1%)</span>
        <span>+{fmt(reward.reserveFee)}</span>
      </div>
      <div className="flex justify-between border-t border-orange-200 pt-2 text-zinc-700 font-semibold dark:border-orange-900/50 dark:text-zinc-300">
        <span>You pay</span>
        <span>{fmt(reward.totalCharged)}</span>
      </div>
      <div className="flex justify-between text-emerald-700 font-bold dark:text-emerald-400">
        <span>Potential win ×{option.oddsMultiplier}</span>
        <span>{fmt(reward.netReward)} <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500">net</span></span>
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-500">5% platform fee applied to winnings</p>
    </div>
  );
}

// ─── Success banner ───────────────────────────────────────────────────────────────

function SuccessBanner({ reference }: { reference: string }) {
  return (
    <div className="rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-5 text-center space-y-2 dark:border-emerald-800/60 dark:bg-emerald-950/20">
      <div className="flex justify-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
          <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </span>
      </div>
      <p className="text-base font-semibold text-emerald-900 dark:text-emerald-300">Prediction submitted!</p>
      <p className="text-sm text-emerald-700 dark:text-emerald-400">
        Your prediction is pending admin review. You&apos;ll be credited once confirmed.
      </p>
      <p className="text-xs text-zinc-400 font-mono break-all">ref: {reference}</p>
    </div>
  );
}

// ─── Comments helpers ─────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 5)}…${addr.slice(-4)}`;
}

function CommentAvatar({
  user,
  size = "md",
}: {
  user: { avatar_src: string | null; username: string | null; wallet_address: string };
  size?: "sm" | "md";
}) {
  const cls = size === "sm" ? "size-6" : "size-8";
  const initial = (user.username ?? user.wallet_address)?.[0]?.toUpperCase() ?? "?";
  return user.avatar_src ? (
    <img
      src={user.avatar_src}
      alt=""
      className={`${cls} shrink-0 rounded-full object-cover`}
      loading="lazy"
    />
  ) : (
    <div
      className={`${cls} shrink-0 flex items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-600 dark:bg-orange-950/40 dark:text-orange-400`}
    >
      {initial}
    </div>
  );
}

// ─── Emoji picker ──────────────────────────────────────────────────────────────────

const EMOJI_LIST = [
  "😀","😂","🤣","😍","🥳","🤔","😮","😎","🙏","💪",
  "🔥","💯","🚀","🎉","💰","📈","📉","⚡","🎯","✅",
  "❌","⚠️","👀","👍","👎","🫱","🤝","💡","🏆","🥇",
  "😱","🤯","💸","🐙","🌊","🦾","🧠","👻","❤️","💎",
];

function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  return (
    <div className="absolute bottom-full left-0 z-50 mb-1 flex w-56 flex-wrap gap-0.5 rounded-xl border border-border bg-card p-2 shadow-xl">
      {EMOJI_LIST.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onSelect(e)}
          className="rounded p-1 text-lg leading-none transition-colors hover:bg-muted"
        >
          {e}
        </button>
      ))}
    </div>
  );
}

// ─── CommentItem ──────────────────────────────────────────────────────────────────

function CommentItem({
  comment,
  marketId,
  isAuthenticated,
  onLike,
  onReply,
}: {
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
  const emojiRef                          = useRef<HTMLDivElement>(null);

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
      {/* Main comment row */}
      <div className="flex gap-3">
        <CommentAvatar user={comment} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              {comment.username ?? shortAddr(comment.wallet_address)}
            </span>
            {comment.octo_balance > 0 && <OctoBadge totalOcto={comment.octo_balance} size={12} />}
            <span className="text-xs text-muted-foreground">{timeAgo(comment.created_at)}</span>
          </div>
          <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed break-words">
            {comment.content}
          </p>
          {/* Actions */}
          <div className="mt-1.5 flex items-center gap-4">
            <button
              type="button"
              onClick={() => onLike(comment.id, false)}
              disabled={!isAuthenticated}
              className={`flex items-center gap-1 text-xs transition-colors disabled:opacity-40 disabled:cursor-default ${
                comment.liked_by_me
                  ? "text-orange-500"
                  : "text-muted-foreground hover:text-orange-400"
              }`}
            >
              <Heart
                className={`size-3.5 ${comment.liked_by_me ? "fill-orange-500" : ""}`}
              />
              {comment.like_count > 0 && <span>{comment.like_count}</span>}
            </button>
            {isAuthenticated && (
              <button
                type="button"
                onClick={() => setShowReplyForm((v) => !v)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-orange-400 transition-colors"
              >
                <MessageCircle className="size-3.5" />
                Reply
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Replies */}
      {comment.replies.length > 0 && (
        <div className="ml-11 mt-3 space-y-3 border-l-2 border-orange-100 pl-4 dark:border-orange-900/30">
          {comment.replies.map((reply) => (
            <div key={reply.id} className="flex gap-3">
              <CommentAvatar user={reply} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                  <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    {reply.username ?? shortAddr(reply.wallet_address)}
                  </span>
                  {reply.octo_balance > 0 && <OctoBadge totalOcto={reply.octo_balance} size={12} />}
                  <span className="text-xs text-muted-foreground">{timeAgo(reply.created_at)}</span>
                </div>
                <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed break-words">
                  {reply.content}
                </p>
                <button
                  type="button"
                  onClick={() => onLike(reply.id, true)}
                  disabled={!isAuthenticated}
                  className={`mt-1 flex items-center gap-1 text-xs transition-colors disabled:opacity-40 disabled:cursor-default ${
                    reply.liked_by_me
                      ? "text-orange-500"
                      : "text-muted-foreground hover:text-orange-400"
                  }`}
                >
                  <Heart
                    className={`size-3.5 ${reply.liked_by_me ? "fill-orange-500" : ""}`}
                  />
                  {reply.like_count > 0 && <span>{reply.like_count}</span>}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inline reply form */}
      {showReplyForm && isAuthenticated && (
        <div className="ml-11 mt-3 flex gap-2">
          <div className="relative flex-1">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void submitReply();
              }}
              placeholder="Write a reply…"
              rows={2}
              maxLength={1000}
              disabled={replyPosting}
              className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2 pb-8 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-orange-400/40 disabled:opacity-50"
            />
            {/* Emoji button */}
            <div className="absolute bottom-2 left-2" ref={emojiRef}>
              <button
                type="button"
                onClick={() => setShowEmoji((v) => !v)}
                className="text-base leading-none opacity-50 hover:opacity-100 transition-opacity"
                aria-label="Add emoji"
              >
                😊
              </button>
              {showEmoji && (
                <EmojiPicker
                  onSelect={(e) => {
                    setReplyText((t) => t + e);
                    setShowEmoji(false);
                  }}
                />
              )}
            </div>
          </div>
          <div className="self-end flex flex-col gap-1.5">
            <button
              onClick={() => void submitReply()}
              disabled={!replyText.trim() || replyPosting}
              className="rounded-xl bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {replyPosting ? "…" : "Reply"}
            </button>
            <button
              onClick={() => { setShowReplyForm(false); setReplyText(""); }}
              className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CommentsSection ───────────────────────────────────────────────────────────────

function CommentsSection({
  marketId,
  initialComments,
  isAuthenticated,
  walletAddress,
  onRequestConnect,
}: {
  marketId: string;
  initialComments: MarketCommentEnriched[];
  isAuthenticated: boolean;
  walletAddress?: string | null;
  onRequestConnect?: () => void;
}) {
  const [comments, setComments]   = useState<MarketCommentEnriched[]>(initialComments);
  const [text, setText]           = useState("");
  const [posting, setPosting]     = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const emojiRef                  = useRef<HTMLDivElement>(null);

  const totalCount = comments.reduce((n, c) => n + 1 + c.replies.length, 0);

  // Close emoji picker on outside click
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
      const res  = await fetch(`/api/markets/${marketId}/comments`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ content: trimmed, wallet_address: walletAddress }),
      });
      const data = await res.json() as MarketCommentEnriched & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const enriched: MarketCommentEnriched = { ...data, like_count: 0, liked_by_me: false, replies: [] };
      setComments((prev) => [enriched, ...prev]);
      setText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to post comment");
    } finally {
      setPosting(false);
    }
  }

  function handleLike(commentId: string, isReply: boolean, parentId?: string) {
    if (!isAuthenticated) { onRequestConnect?.(); return; }

    // Optimistic toggle
    function toggle(c: MarketCommentEnriched): MarketCommentEnriched {
      if (!isReply && c.id === commentId) {
        return { ...c, liked_by_me: !c.liked_by_me, like_count: c.liked_by_me ? c.like_count - 1 : c.like_count + 1 };
      }
      if (isReply && c.id === parentId) {
        return {
          ...c,
          replies: c.replies.map((r) =>
            r.id === commentId
              ? { ...r, liked_by_me: !r.liked_by_me, like_count: r.liked_by_me ? r.like_count - 1 : r.like_count + 1 }
              : r
          ),
        };
      }
      return c;
    }

    setComments((prev) => prev.map(toggle));

    fetch(`/api/markets/${marketId}/comments/like`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ comment_id: commentId, wallet_address: walletAddress }),
    })
      .then(async (res) => {
        if (!res.ok) { setComments((prev) => prev.map(toggle)); return; }
        const data = await res.json() as { liked: boolean; like_count: number };
        setComments((prev) => prev.map((c) => {
          if (!isReply && c.id === commentId)
            return { ...c, liked_by_me: data.liked, like_count: data.like_count };
          if (isReply && c.id === parentId)
            return { ...c, replies: c.replies.map((r) =>
              r.id === commentId ? { ...r, liked_by_me: data.liked, like_count: data.like_count } : r
            )};
          return c;
        }));
      })
      .catch(() => {
        // Revert on failure
        setComments((prev) => prev.map(toggle));
      });
  }

  async function handleReply(parentId: string, content: string) {
    const res = await fetch(`/api/markets/${marketId}/comments`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ content, parent_id: parentId, wallet_address: walletAddress }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Error");
    const enriched: MarketCommentEnriched = { ...data, like_count: 0, liked_by_me: false, replies: [] };
    setComments((prev) =>
      prev.map((c) =>
        c.id === parentId
          ? { ...c, replies: [...c.replies, enriched] }
          : c
      )
    );
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        Comments {totalCount > 0 && `(${totalCount})`}
      </h2>

      {/* Input area */}
      <div className="mb-5 flex gap-2">
        <div className="relative flex-1">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void postComment();
            }}
            placeholder="Share your analysis…"
            disabled={posting}
            rows={2}
            maxLength={1000}
            className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2 pb-8 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-orange-400/40 disabled:opacity-50"
          />
          {/* Emoji button */}
          <div className="absolute bottom-2 left-2" ref={emojiRef}>
            <button
              type="button"
              onClick={() => setShowEmoji((v) => !v)}
              className="text-base leading-none opacity-50 hover:opacity-100 transition-opacity"
              aria-label="Add emoji"
            >
              😊
            </button>
            {showEmoji && (
              <EmojiPicker
                onSelect={(e) => {
                  setText((t) => t + e);
                  setShowEmoji(false);
                }}
              />
            )}
          </div>
          {text.length > 800 && (
            <span className="absolute bottom-2 right-2 text-xs text-muted-foreground">
              {text.length}/1000
            </span>
          )}
        </div>
        <button
          onClick={() => void postComment()}
          disabled={posting}
          className="self-end rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {posting ? "…" : "Post"}
        </button>
      </div>

      {/* Comments list */}
      {comments.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No comments yet — be the first!
        </p>
      ) : (
        <div className="space-y-5">
          {comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              marketId={marketId}
              isAuthenticated={isAuthenticated}
              onLike={(id, isReply) => handleLike(id, isReply, c.id)}
              onReply={handleReply}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────────

export function PredictionDetail({
  market,
  volumeDetail,
  initialComments,
}: {
  market: PredictionMarketRow;
  volumeDetail: MarketVolumeDetail;
  initialComments: MarketCommentEnriched[];
}) {
  const { walletAddress, walletType, isAuthenticated, setWalletType } = useAuth();

  const options = useMemo(() => parseMarketOptions(market.options), [market.options]);
  const probs   = useMemo(() => computeProbabilities(options), [options]);

  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const [token,         setToken]         = useState<BetToken>("usdc");
  const [rawAmount,     setRawAmount]     = useState("");
  const [submitState,   setSubmitState]   = useState<SubmitState>("idle");
  const [errorMsg,      setErrorMsg]      = useState("");
  const [successRef,    setSuccessRef]    = useState("");
  const [showWallet,    setShowWallet]    = useState(false);

  const amount      = parseFloat(rawAmount) || 0;
  const selectedOpt = options.find((o) => o.id === selectedId) ?? null;

  const minStake = token === "clawdtrust" ? MIN_STAKE_CLT : MIN_STAKE_USDC;
  const maxStake = token === "clawdtrust" ? Infinity       : MAX_STAKE_USDC;
  const isAmountValid = amount >= minStake && amount <= maxStake;
  const canSubmit = !!selectedOpt && isAmountValid && submitState === "idle";

  const handleWalletSelect = useCallback(async (type: WalletType) => {
    setShowWallet(false);
    try {
      await connectWalletAndAuth(type);
      setWalletType(type);
    } catch (err) {
      toast.error("Connection failed", {
        description: err instanceof Error ? err.message : "Could not connect wallet.",
      });
    }
  }, [setWalletType]);

  async function handleSubmit() {
    if (!isAuthenticated || !walletAddress) {
      setShowWallet(true);
      return;
    }
    if (!selectedOpt) {
      toast.error("Choose an option first.");
      return;
    }
    if (!isAmountValid) {
      toast.error("Invalid amount", {
        description:
          token === "clawdtrust"
            ? `Minimum ${MIN_STAKE_CLT.toLocaleString("en-US")} ClawdTrust.`
            : `Enter between $${MIN_STAKE_USDC} and $${MAX_STAKE_USDC} USDC.`,
      });
      return;
    }

    setSubmitState("signing");
    setErrorMsg("");

    const result = await submitBet({
      marketId:         market.id,
      marketTitle:      market.title,
      categoryId:       market.category_id,
      optionId:         selectedOpt.id,
      optionLabel:      selectedOpt.label,
      optionMultiplier: selectedOpt.oddsMultiplier,
      amount,
      token,
      walletAddress,
      walletType: walletType!,
    });

    if (result.success) {
      setSubmitState("success");
      setSuccessRef(result.reference);
    } else {
      setSubmitState("error");
      setErrorMsg(result.error);
    }
  }

  const totalVol = fmtVol(volumeDetail.total.usdc, volumeDetail.total.clt);

  return (
    <>
      {/* Wallet dialog */}
      {showWallet && (
        <WalletSelectDialog
          wallets={getAvailableWallets()}
          onSelect={handleWalletSelect}
          onClose={() => setShowWallet(false)}
        />
      )}

      {/* Market header card */}
      <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-5 mb-6 dark:border-orange-900/50 dark:bg-orange-950/10">
        {/* Top row: status + share */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <StatusBadge market={market} />
          <ShareButton />
        </div>

        {/* Title */}
        <p className="text-base font-bold text-zinc-900 dark:text-zinc-100 leading-snug mb-3">
          {market.title}
        </p>

        {/* Countdown badge */}
        {market.event_start_at && (
          <div className="mb-3">
            <MarketCountdownBadge eventStartAt={market.event_start_at} />
          </div>
        )}

        <MarketVisual market={market} />

        {/* Volume + date row */}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-400 dark:text-zinc-500">
          {totalVol !== "—" && (
            <span>
              <span className="font-semibold text-zinc-600 dark:text-zinc-400">Vol:</span> {totalVol}
            </span>
          )}
          {market.event_date_label && (
            <span>{market.event_date_label}</span>
          )}
        </div>
      </div>

      {/* Success state */}
      {submitState === "success" ? (
        <SuccessBanner reference={successRef} />
      ) : (
        <div className="space-y-5">

          {/* 1 — Option selector with % */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Your prediction
            </h2>
            <div
              className={
                options.length === 3
                  ? "flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0"
                  : "grid grid-cols-2 gap-2"
              }
            >
              {options.map((opt, idx) => {
                const isSelected  = opt.id === selectedId;
                const prob        = probs[idx];
                const optVol      = volumeDetail.byOption[opt.id];
                const optVolLabel = optVol ? fmtVol(optVol.usdc, optVol.clt) : null;
                const color       = optionColor(idx, opt.label);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedId(opt.id)}
                    className={[
                      "flex flex-col gap-1.5 rounded-2xl border px-3 py-3 text-left transition-all",
                      options.length === 3 ? "min-w-[130px] shrink-0 sm:min-w-0 sm:shrink" : "",
                      isSelected
                        ? `${color.border} ${color.bg} shadow-md`
                        : color.idle,
                    ].join(" ")}
                  >
                    {/* Logo + multiplier */}
                    <div className="flex items-center justify-between gap-2">
                      {opt.logoSrc ? (
                        <img
                          src={opt.logoSrc}
                          alt={opt.label}
                          className="size-5 shrink-0 rounded-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="size-5 shrink-0" />
                      )}
                      <span className={`shrink-0 text-sm font-bold ${isSelected ? color.text : "text-zinc-900 dark:text-zinc-100"}`}>
                        x{opt.oddsMultiplier}
                      </span>
                    </div>
                    {/* Label */}
                    <span className={`line-clamp-2 text-xs font-semibold leading-tight ${isSelected ? color.text : "text-zinc-800 dark:text-zinc-200"}`}>
                      {opt.label}
                    </span>
                    {/* Probability % */}
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <span className={`text-xs font-bold ${isSelected ? color.probText : "text-zinc-600 dark:text-zinc-400"}`}>
                        {prob}%
                      </span>
                      {optVolLabel && (
                        <span className={`text-[10px] truncate ${isSelected ? color.volText : "text-zinc-400 dark:text-zinc-500"}`}>
                          {optVolLabel}
                        </span>
                      )}
                    </div>
                    {/* Probability bar */}
                    <div className={`h-1 w-full rounded-full overflow-hidden ${isSelected ? color.barBg : "bg-zinc-100 dark:bg-zinc-800"}`}>
                      <div
                        className={`h-full rounded-full transition-all ${isSelected ? color.barFill : color.bar}`}
                        style={{ width: `${prob}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2 — Token selector */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Token
            </h2>
            <div className="flex gap-2">
              {(["usdc", "clawdtrust"] as BetToken[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setToken(t); setRawAmount(""); }}
                  className={[
                    "flex-1 rounded-xl border py-2 text-sm font-semibold transition-all",
                    token === t
                      ? "border-orange-500 bg-orange-500 text-white"
                      : "border-orange-200 bg-white text-zinc-700 hover:border-orange-300 dark:border-orange-900/40 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-orange-700/60",
                  ].join(" ")}
                >
                  {t === "usdc" ? "USDC" : "ClawdTrust"}
                </button>
              ))}
            </div>
          </section>

          {/* 3 — Amount */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Stake amount
            </h2>
            <div className="mb-2 flex gap-2 flex-wrap">
              {(token === "clawdtrust" ? QUICK_CLT : QUICK_USDC).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setRawAmount(String(v))}
                  className={[
                    "rounded-lg border px-3 py-1 text-xs font-semibold transition-all",
                    rawAmount === String(v)
                      ? "border-orange-500 bg-orange-500 text-white"
                      : "border-orange-200 bg-white text-zinc-600 hover:border-orange-300 dark:border-orange-900/40 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-orange-700/60",
                  ].join(" ")}
                >
                  {token === "clawdtrust" ? formatCLT(v) : `$${v}`}
                </button>
              ))}
            </div>
            <div className="relative">
              <input
                type="number"
                inputMode="decimal"
                value={rawAmount}
                onChange={(e) => setRawAmount(e.target.value)}
                placeholder={
                  token === "clawdtrust"
                    ? `Min ${MIN_STAKE_CLT.toLocaleString("en-US")}`
                    : `$${MIN_STAKE_USDC} – $${MAX_STAKE_USDC}`
                }
                className="w-full rounded-xl border border-orange-200 bg-white px-4 py-3 pr-24 text-sm font-medium outline-none transition placeholder:text-zinc-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 dark:border-orange-900/50 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-orange-600"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-400 dark:text-zinc-500">
                {token === "clawdtrust" ? "ClawdTrust" : "USDC"}
              </span>
            </div>
            {rawAmount && !isAmountValid && (
              <p className="mt-1.5 text-xs text-red-500 dark:text-red-400">
                {token === "clawdtrust"
                  ? `Minimum ${MIN_STAKE_CLT.toLocaleString("en-US")} ClawdTrust`
                  : `Enter between $${MIN_STAKE_USDC} and $${MAX_STAKE_USDC}`}
              </p>
            )}
          </section>

          {/* 4 — Reward summary */}
          {selectedOpt && isAmountValid && (
            <RewardSummary amount={amount} option={selectedOpt} token={token} />
          )}

          {/* 5 — Error message */}
          {submitState === "error" && errorMsg && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400">
              {errorMsg}
            </div>
          )}

          {/* 6 — Submit */}
          <button
            type="button"
            onClick={() => { if (!isAuthenticated) { setShowWallet(true); } else { void handleSubmit(); } }}
            disabled={isAuthenticated && !canSubmit}
            className={[
              "w-full rounded-2xl px-5 py-3.5 text-sm font-bold transition-all",
              isAuthenticated && !canSubmit
                ? "cursor-not-allowed bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600"
                : "bg-orange-500 text-white shadow-md hover:bg-orange-400 active:scale-[0.98]",
            ].join(" ")}
          >
            {submitState === "signing" || submitState === "submitting" ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                {submitState === "signing" ? "Waiting for signature…" : "Confirming…"}
              </span>
            ) : (
              "Confirm prediction"
            )}
          </button>

          {/* 7 — Resolution criteria */}
          {market.resolution_criteria && (
            <section className="rounded-2xl border border-border bg-muted/30 px-4 py-4 space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Resolution criteria
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap">
                {market.resolution_criteria}
              </p>
            </section>
          )}

        </div>
      )}

      {/* 8 — Comments (always visible) */}
      <div className="mt-8 border-t border-border pt-6">
        <CommentsSection
          marketId={market.id}
          initialComments={initialComments}
          isAuthenticated={isAuthenticated}
          walletAddress={walletAddress}
          onRequestConnect={() => setShowWallet(true)}
        />
      </div>
    </>
  );
}
