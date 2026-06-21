/**
 * ai-market-social-store.ts — MIGRÉ VERS SUPABASE
 *
 * Remplace : localStorage (octopus-market-tool-social-v3) + SSE + BroadcastChannel
 * Par : Supabase tables tool_ratings / tool_reactions / tool_comments + Realtime
 *
 * Types conservés. Cache mémoire populé par Supabase.
 */

import {
  getToolSocial,
  rateTooling,
  reactToTool as reactToToolDb,
  removeReaction,
  addComment,
  deleteComment,
  reportTool as reportToolDb,
  subscribeToToolSocial,
} from "@/services/supabase/social-service";
import type { ToolReactionRow, ToolRatingRow } from "@/lib/supabase-types";

// ─── Types publics (inchangés) ────────────────────────────────────────────────

export type ToolReactionType = "heart" | "thumbs-up" | "flame";

export type ToolComment = {
  id: string;
  author: string;
  content: string;
  createdAt: number;
};

export type ToolSocialRecord = {
  toolName: string;
  ratingAverage: number;
  ratingCount: number;
  userRatings: Record<string, number>;
  reactions: Record<ToolReactionType, number>;
  userReactions: Record<string, ToolReactionType>;
  comments: ToolComment[];
  reports: number;
};

// ─── Cache mémoire ────────────────────────────────────────────────────────────

let toolSocialCache: Record<string, ToolSocialRecord> = {};
const toolSocialEventName = "octopus-market-tool-social-updated";
const realtimeUnsubs: Map<string, () => void> = new Map();

function emitUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(toolSocialEventName));
  }
}

function buildReactionCounters(
  reactions: ToolReactionRow[]
): Record<ToolReactionType, number> {
  const counts: Record<ToolReactionType, number> = {
    heart: 0,
    "thumbs-up": 0,
    flame: 0,
  };
  for (const r of reactions) {
    if (r.reaction_type in counts) {
      counts[r.reaction_type as ToolReactionType]++;
    }
  }
  return counts;
}

function buildUserRatings(ratings: ToolRatingRow[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const r of ratings) {
    map[r.actor_key] = r.rating;
  }
  return map;
}

function buildUserReactions(reactions: ToolReactionRow[]): Record<string, ToolReactionType> {
  const map: Record<string, ToolReactionType> = {};
  for (const r of reactions) {
    map[r.actor_key] = r.reaction_type as ToolReactionType;
  }
  return map;
}

// ─── Initialisation par outil ─────────────────────────────────────────────────

/**
 * Charge les données sociales d'un outil et démarre la subscription Realtime.
 * Appeler au montage du composant qui affiche l'outil.
 */
export async function initToolSocial(
  toolName: string,
  actorKey?: string
): Promise<ToolSocialRecord> {
  const data = await getToolSocial(toolName, actorKey);

  const record: ToolSocialRecord = {
    toolName,
    ratingAverage: data?.social.rating_average ?? 0,
    ratingCount: data?.social.rating_count ?? 0,
    userRatings: buildUserRatings(data?.ratings ?? []),
    reactions: buildReactionCounters(data?.reactions ?? []),
    userReactions: buildUserReactions(data?.reactions ?? []),
    comments: (data?.comments ?? []).map((c) => ({
      id: c.id,
      author: c.author,
      content: c.content,
      createdAt: new Date(c.created_at).getTime(),
    })),
    reports: data?.social.reports ?? 0,
  };

  toolSocialCache[toolName] = record;
  emitUpdate();

  // Realtime : recharger les données à chaque changement
  if (!realtimeUnsubs.has(toolName)) {
    const channel = subscribeToToolSocial(toolName, async () => {
      await initToolSocial(toolName, actorKey);
    });
    realtimeUnsubs.set(toolName, () => { void channel.unsubscribe(); });
  }

  return record;
}

// ─── Lecture ──────────────────────────────────────────────────────────────────

export function readToolSocial(toolName: string): ToolSocialRecord | null {
  return toolSocialCache[toolName] ?? null;
}

export function readAllToolSocial(): Record<string, ToolSocialRecord> {
  return toolSocialCache;
}

// ─── Note ────────────────────────────────────────────────────────────────────

export async function rateToolByActor(
  toolName: string,
  actorKey: string,
  rating: number
): Promise<{ success: boolean; error?: string }> {
  const result = await rateTooling(toolName, actorKey, rating);
  if (result.success) {
    const current = toolSocialCache[toolName];
    if (current) {
      const newRatings = { ...current.userRatings, [actorKey]: rating };
      const values = Object.values(newRatings);
      const avg = values.reduce((s, v) => s + v, 0) / values.length;
      toolSocialCache[toolName] = {
        ...current,
        userRatings: newRatings,
        ratingAverage: Math.round(avg * 10) / 10,
        ratingCount: values.length,
      };
      emitUpdate();
    }
  }
  return result;
}

// ─── Réaction ────────────────────────────────────────────────────────────────

export async function reactToToolByActor(
  toolName: string,
  actorKey: string,
  reactionType: ToolReactionType
): Promise<{ success: boolean; error?: string }> {
  const current = toolSocialCache[toolName];
  const existingReaction = current?.userReactions[actorKey];

  // Toggle : si même réaction, on supprime
  if (existingReaction === reactionType) {
    const result = await removeReaction(toolName, actorKey);
    if (result.success && current) {
      const newUserReactions = { ...current.userReactions };
      delete newUserReactions[actorKey];
      toolSocialCache[toolName] = {
        ...current,
        userReactions: newUserReactions,
        reactions: {
          ...current.reactions,
          [reactionType]: Math.max(0, (current.reactions[reactionType] ?? 0) - 1),
        },
      };
      emitUpdate();
    }
    return result;
  }

  const result = await reactToToolDb(toolName, actorKey, reactionType);
  if (result.success && current) {
    const newUserReactions = { ...current.userReactions, [actorKey]: reactionType };
    const newReactions = { ...current.reactions };

    // Décrémenter l'ancienne réaction si elle existe
    if (existingReaction) {
      newReactions[existingReaction] = Math.max(0, (newReactions[existingReaction] ?? 0) - 1);
    }
    newReactions[reactionType] = (newReactions[reactionType] ?? 0) + 1;

    toolSocialCache[toolName] = {
      ...current,
      userReactions: newUserReactions,
      reactions: newReactions,
    };
    emitUpdate();
  }
  return result;
}

// ─── Commentaire ─────────────────────────────────────────────────────────────

export async function addToolComment(
  toolName: string,
  author: string,
  content: string
): Promise<{ success: boolean; error?: string }> {
  const result = await addComment(toolName, author, content);
  if (result.success && result.data) {
    const current = toolSocialCache[toolName];
    if (current) {
      const newComment: ToolComment = {
        id: result.data.id,
        author: result.data.author,
        content: result.data.content,
        createdAt: new Date(result.data.created_at).getTime(),
      };
      toolSocialCache[toolName] = {
        ...current,
        comments: [newComment, ...current.comments].slice(0, 50),
      };
      emitUpdate();
    }
  }
  return { success: result.success, error: result.error };
}

export async function removeToolComment(
  toolName: string,
  commentId: string
): Promise<{ success: boolean; error?: string }> {
  const result = await deleteComment(commentId);
  if (result.success) {
    const current = toolSocialCache[toolName];
    if (current) {
      toolSocialCache[toolName] = {
        ...current,
        comments: current.comments.filter((c) => c.id !== commentId),
      };
      emitUpdate();
    }
  }
  return result;
}

// ─── Signalement ─────────────────────────────────────────────────────────────

export async function reportToolByActor(
  toolName: string
): Promise<{ success: boolean; error?: string }> {
  const result = await reportToolDb(toolName);
  if (result.success) {
    const current = toolSocialCache[toolName];
    if (current) {
      toolSocialCache[toolName] = { ...current, reports: current.reports + 1 };
      emitUpdate();
    }
  }
  return result;
}

// ─── Souscription (compatible composants existants) ───────────────────────────

export function subscribeToToolSocialStore(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(toolSocialEventName, listener);
  return () => window.removeEventListener(toolSocialEventName, listener);
}

// ─── Nettoyage Realtime ───────────────────────────────────────────────────────

export function unsubscribeToolSocial(toolName: string): void {
  const unsub = realtimeUnsubs.get(toolName);
  if (unsub) {
    unsub();
    realtimeUnsubs.delete(toolName);
  }
}

// ─── Aliases de compatibilité (noms anciens attendus par les composants) ───────

/** @deprecated → readToolSocial() */
export const getToolSocialRecord = readToolSocial;

/** @deprecated → rateToolByActor() */
export const rateTool = rateToolByActor;

/** @deprecated → reactToToolByActor() */
export const reactToTool = reactToToolByActor;

/** @deprecated → reportToolByActor() */
export const reportTool = reportToolByActor;

/** @deprecated → addToolComment() */
export const commentOnTool = addToolComment;

/** @deprecated → subscribeToToolSocialStore() */
export const subscribeToToolSocialRecords = subscribeToToolSocialStore;
