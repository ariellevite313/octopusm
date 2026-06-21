/**
 * Social Service — remplace ai-market-social-store.ts
 * Notes, réactions, commentaires et signalements des outils IA
 */

import { supabase } from "../../lib/supabase";
import type {
  AIToolSocialRow,
  ToolRatingRow,
  ToolReactionRow,
  ToolCommentRow,
  ToolReactionType,
} from "../../lib/supabase-types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToolSocialData {
  social: AIToolSocialRow;
  ratings: ToolRatingRow[];
  reactions: ToolReactionRow[];
  comments: ToolCommentRow[];
  myRating?: number;
  myReaction?: ToolReactionType;
}

// ─── Lecture ──────────────────────────────────────────────────────────────────

export async function getToolSocial(
  toolName: string,
  actorKey?: string
): Promise<ToolSocialData | null> {
  // Récupérer ou créer le record social
  const social = await getOrCreateToolSocial(toolName);
  if (!social) return null;

  const [ratingsResult, reactionsResult, commentsResult] = await Promise.all([
    supabase
      .from("tool_ratings")
      .select("*")
      .eq("tool_name", toolName),
    supabase
      .from("tool_reactions")
      .select("*")
      .eq("tool_name", toolName),
    supabase
      .from("tool_comments")
      .select("*")
      .eq("tool_name", toolName)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const ratings = ratingsResult.data ?? [];
  const reactions = reactionsResult.data ?? [];
  const comments = commentsResult.data ?? [];

  const myRating = actorKey
    ? ratings.find((r) => r.actor_key === actorKey)?.rating
    : undefined;
  const myReaction = actorKey
    ? reactions.find((r) => r.actor_key === actorKey)?.reaction_type
    : undefined;

  return { social, ratings, reactions, comments, myRating, myReaction };
}

async function getOrCreateToolSocial(
  toolName: string
): Promise<AIToolSocialRow | null> {
  const { data: existing } = await supabase
    .from("ai_tool_social")
    .select("*")
    .eq("tool_name", toolName)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("ai_tool_social")
    .insert({ tool_name: toolName })
    .select()
    .single();

  if (error) {
    console.error("[social-service] getOrCreateToolSocial:", error.message);
    return null;
  }
  return created;
}

// ─── Note (rating) ────────────────────────────────────────────────────────────

export async function rateTooling(
  toolName: string,
  actorKey: string,
  rating: number
): Promise<{ success: boolean; error?: string }> {
  if (rating < 1 || rating > 5) {
    return { success: false, error: "La note doit être entre 1 et 5." };
  }

  // Upsert la note de l'utilisateur
  const { error: ratingError } = await supabase
    .from("tool_ratings")
    .upsert(
      { tool_name: toolName, actor_key: actorKey, rating },
      { onConflict: "tool_name,actor_key" }
    );

  if (ratingError) return { success: false, error: ratingError.message };

  // Recalculer la moyenne
  const { data: allRatings } = await supabase
    .from("tool_ratings")
    .select("rating")
    .eq("tool_name", toolName);

  if (allRatings && allRatings.length > 0) {
    const avg =
      allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length;

    await supabase
      .from("ai_tool_social")
      .update({
        rating_average: Math.round(avg * 10) / 10,
        rating_count: allRatings.length,
      })
      .eq("tool_name", toolName);
  }

  return { success: true };
}

// ─── Réaction ─────────────────────────────────────────────────────────────────

export async function reactToTool(
  toolName: string,
  actorKey: string,
  reactionType: ToolReactionType
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("tool_reactions")
    .upsert(
      { tool_name: toolName, actor_key: actorKey, reaction_type: reactionType },
      { onConflict: "tool_name,actor_key" }
    );

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function removeReaction(
  toolName: string,
  actorKey: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("tool_reactions")
    .delete()
    .eq("tool_name", toolName)
    .eq("actor_key", actorKey);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─── Commentaire ──────────────────────────────────────────────────────────────

export async function addComment(
  toolName: string,
  author: string,
  content: string
): Promise<{ success: boolean; data?: ToolCommentRow; error?: string }> {
  const trimmed = content.trim();
  if (!trimmed) return { success: false, error: "Le commentaire est vide." };
  if (trimmed.length > 500) {
    return { success: false, error: "Le commentaire ne doit pas dépasser 500 caractères." };
  }

  const id = `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const { data, error } = await supabase
    .from("tool_comments")
    .insert({ id, tool_name: toolName, author, content: trimmed })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function deleteComment(
  commentId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("tool_comments")
    .delete()
    .eq("id", commentId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─── Signalement ──────────────────────────────────────────────────────────────

export async function reportTool(
  toolName: string
): Promise<{ success: boolean; error?: string }> {
  // Incrément atomique du compteur de signalements
  const { data: current } = await supabase
    .from("ai_tool_social")
    .select("reports")
    .eq("tool_name", toolName)
    .maybeSingle();

  if (!current) await getOrCreateToolSocial(toolName);

  const { error } = await supabase
    .from("ai_tool_social")
    .update({ reports: (current?.reports ?? 0) + 1 })
    .eq("tool_name", toolName);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─── Realtime ─────────────────────────────────────────────────────────────────

export function subscribeToToolSocial(
  toolName: string,
  onUpdate: () => void
) {
  return supabase
    .channel(`social-${toolName}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "tool_ratings",
        filter: `tool_name=eq.${toolName}`,
      },
      onUpdate
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "tool_reactions",
        filter: `tool_name=eq.${toolName}`,
      },
      onUpdate
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "tool_comments",
        filter: `tool_name=eq.${toolName}`,
      },
      onUpdate
    )
    .subscribe();
}
