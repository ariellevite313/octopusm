/**
 * Memory Service — remplace cyrdoge-memory.ts
 * Mémoire persistante de l'agent IA (CyrDoge / Aido) par wallet
 */

import { supabase } from "../../lib/supabase";
import type { AIMemoryRow } from "../../lib/supabase-types";

// ─── Type public (aligné sur CyrDogeMemory existant) ─────────────────────────

export interface AgentMemory {
  user: {
    name: string | null;
    age: string | null;
    location: string | null;
    profession: string | null;
  };
  preferences: {
    languagePreference: "fr" | "en" | null;
    responseStyle: string | null;
    tonePreference: string | null;
    humorPreference: string | null;
  };
  projectsInProgress: string[];
  currentGoals: string[];
  importantInformation: string[];
  updatedAt: number;
}

// ─── Conversion DB ↔ app ──────────────────────────────────────────────────────

function rowToMemory(row: AIMemoryRow): AgentMemory {
  return {
    user: {
      name: row.user_name,
      age: row.user_age,
      location: row.user_location,
      profession: row.user_profession,
    },
    preferences: {
      languagePreference: row.language_preference ?? null,
      responseStyle: row.response_style,
      tonePreference: row.tone_preference,
      humorPreference: row.humor_preference,
    },
    projectsInProgress: row.projects_in_progress ?? [],
    currentGoals: row.current_goals ?? [],
    importantInformation: row.important_information ?? [],
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

function memoryToRow(
  walletAddress: string,
  memory: Partial<AgentMemory>
): Partial<AIMemoryRow> & { wallet_address: string } {
  return {
    wallet_address: walletAddress,
    ...(memory.user?.name !== undefined && { user_name: memory.user.name }),
    ...(memory.user?.age !== undefined && { user_age: memory.user.age }),
    ...(memory.user?.location !== undefined && { user_location: memory.user.location }),
    ...(memory.user?.profession !== undefined && { user_profession: memory.user.profession }),
    ...(memory.preferences?.languagePreference !== undefined && {
      language_preference: memory.preferences.languagePreference ?? "en",
    }),
    ...(memory.preferences?.responseStyle !== undefined && {
      response_style: memory.preferences.responseStyle,
    }),
    ...(memory.preferences?.tonePreference !== undefined && {
      tone_preference: memory.preferences.tonePreference,
    }),
    ...(memory.preferences?.humorPreference !== undefined && {
      humor_preference: memory.preferences.humorPreference,
    }),
    ...(memory.projectsInProgress !== undefined && {
      projects_in_progress: memory.projectsInProgress,
    }),
    ...(memory.currentGoals !== undefined && {
      current_goals: memory.currentGoals,
    }),
    ...(memory.importantInformation !== undefined && {
      important_information: memory.importantInformation,
    }),
  };
}

// ─── Lecture ──────────────────────────────────────────────────────────────────

export async function getAgentMemory(
  walletAddress: string
): Promise<AgentMemory | null> {
  const { data, error } = await supabase
    .from("ai_memory")
    .select("*")
    .eq("wallet_address", walletAddress)
    .maybeSingle();

  if (error) {
    console.error("[memory-service] getAgentMemory:", error.message);
    return null;
  }
  if (!data) return null;
  return rowToMemory(data);
}

// ─── Écriture ─────────────────────────────────────────────────────────────────

/**
 * Crée ou met à jour la mémoire de l'agent pour ce wallet.
 */
export async function saveAgentMemory(
  walletAddress: string,
  memory: Partial<AgentMemory>
): Promise<{ success: boolean; error?: string }> {
  const row = memoryToRow(walletAddress, memory);

  const { error } = await supabase
    .from("ai_memory")
    .upsert(row, { onConflict: "wallet_address" });

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Ajoute un élément à une liste (projectsInProgress, currentGoals, importantInformation)
 * en respectant la limite de 6 éléments.
 */
export async function addMemoryListItem(
  walletAddress: string,
  field: "projectsInProgress" | "currentGoals" | "importantInformation",
  item: string,
  maxItems = 6
): Promise<{ success: boolean; error?: string }> {
  const existing = await getAgentMemory(walletAddress);
  const list = existing?.[field] ?? [];

  if (list.includes(item)) return { success: true }; // déjà présent

  const newList = [item, ...list].slice(0, maxItems);

  return saveAgentMemory(walletAddress, { [field]: newList });
}

/**
 * Supprime la mémoire de l'agent (reset complet).
 */
export async function clearAgentMemory(
  walletAddress: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("ai_memory")
    .delete()
    .eq("wallet_address", walletAddress);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
