import { useEffect, useMemo, useState } from "react";
import { Flame, Heart, MessageSquare, ShieldAlert, Star, ThumbsUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  commentOnTool,
  getToolSocialRecord,
  rateTool,
  reactToTool,
  reportTool,
  subscribeToToolSocialRecords,
} from "@/components/octopus-market/ai-market-social-store";

type AIToolSocialPanelProps = {
  toolName: string;
  actorKey: string;
  actorLabel: string;
};

function formatMoment(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function AIToolSocialPanel({ toolName, actorKey, actorLabel }: AIToolSocialPanelProps) {
  const [commentDraft, setCommentDraft] = useState("");
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    return subscribeToToolSocialRecords(() => {
      setRefreshIndex((currentValue) => currentValue + 1);
    });
  }, []);

  const socialRecord = useMemo(() => getToolSocialRecord(toolName), [refreshIndex, toolName]);
  const activeReaction = socialRecord.userReactions[actorKey];

  return (
    <div className="space-y-3 rounded-2xl border border-orange-100 bg-orange-50/80 p-4 dark:border-white/10 dark:bg-black/20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1">
          {[1, 2, 3, 4, 5].map((rating) => (
            <button
              key={rating}
              type="button"
              onClick={() => rateTool(toolName, actorKey, rating)}
              className="rounded-full p-1 text-orange-500 transition hover:scale-105 dark:text-orange-300"
              aria-label={`Rate ${toolName} ${rating} stars`}
            >
              <Star className="size-4 fill-current" />
            </button>
          ))}
          <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
            {socialRecord.ratingCount > 0
              ? `${socialRecord.ratingAverage}/5 from ${socialRecord.ratingCount} ratings`
              : "No ratings yet"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={`rounded-full border-orange-200 bg-white text-zinc-800 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:hover:bg-zinc-900 ${activeReaction === "heart" ? "ring-2 ring-red-300" : ""}`}
            onClick={() => reactToTool(toolName, actorKey, "heart")}
          >
            <Heart className="size-4 text-red-500" />
            {socialRecord.reactions.heart}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={`rounded-full border-orange-200 bg-white text-zinc-800 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:hover:bg-zinc-900 ${activeReaction === "thumbs-up" ? "ring-2 ring-sky-300" : ""}`}
            onClick={() => reactToTool(toolName, actorKey, "thumbs-up")}
          >
            <ThumbsUp className="size-4 text-sky-500" />
            {socialRecord.reactions["thumbs-up"]}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={`rounded-full border-orange-200 bg-white text-zinc-800 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:hover:bg-zinc-900 ${activeReaction === "flame" ? "ring-2 ring-orange-300" : ""}`}
            onClick={() => reactToTool(toolName, actorKey, "flame")}
          >
            <Flame className="size-4 text-orange-500" />
            {socialRecord.reactions.flame}
          </Button>
        </div>
      </div>

      <div className="text-xs text-zinc-500 dark:text-zinc-400">
        One reaction per user is stored for each AI card.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full border-orange-200 bg-white text-zinc-800 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:hover:bg-zinc-900"
          onClick={() => setCommentsVisible((currentValue) => !currentValue)}
        >
          <MessageSquare className="size-4" />
          {commentsVisible ? "Hide comments" : "Show comments"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full border-orange-200 bg-white text-zinc-800 hover:bg-orange-50 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:hover:bg-zinc-900"
          onClick={() => reportTool(toolName)}
        >
          <ShieldAlert className="size-4 text-orange-500" />
          Report
        </Button>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {socialRecord.reports} safety report{socialRecord.reports > 1 ? "s" : ""}
        </span>
      </div>

      {commentsVisible ? (
        <div className="space-y-3 rounded-2xl border border-orange-100 bg-white p-3 dark:border-white/10 dark:bg-zinc-950/70">
          <div className="flex gap-2">
            <Input
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
              placeholder="Share your opinion about this AI"
              className="border-orange-200 bg-white text-zinc-950 dark:border-white/10 dark:bg-zinc-950 dark:text-white"
            />
            <Button
              type="button"
              className="rounded-xl bg-orange-500 text-white hover:bg-orange-400"
              onClick={() => {
                commentOnTool(toolName, actorLabel, commentDraft);
                setCommentDraft("");
              }}
              disabled={!commentDraft.trim()}
            >
              Post
            </Button>
          </div>

          <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
            {socialRecord.comments.length > 0 ? (
              socialRecord.comments.map((comment) => (
                <div
                  key={comment.id}
                  className="rounded-xl border border-orange-100 bg-orange-50/80 px-3 py-3 text-sm dark:border-white/10 dark:bg-black/20"
                >
                  <div className="flex items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                    <span>{comment.author}</span>
                    <span>{formatMoment(comment.createdAt)}</span>
                  </div>
                  <p className="mt-2 text-zinc-700 dark:text-zinc-300">{comment.content}</p>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-orange-200 bg-white px-3 py-3 text-sm text-zinc-500 dark:border-white/10 dark:bg-zinc-950/70 dark:text-zinc-400">
                No comments yet.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
