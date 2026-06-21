/**
 * localStorage-migration.ts
 *
 * One-time cleanup of legacy localStorage keys that have been superseded by Supabase.
 * Call runLocalStorageMigration() once on app start (no wallet required).
 * Call migrateWalletMemory(walletAddress) once after wallet connects to attempt
 * moving old agent memory from localStorage → Supabase.
 */

import { getAgentMemory, saveAgentMemory } from "@/services/supabase/memory-service";

const MIGRATION_DONE_KEY = "octopus-market-supabase-migration-v1";
const LEGACY_MEMORY_KEY = "octopus-market-aido-agent-memory-v3";

/** Legacy keys that are now fully replaced by Supabase — safe to remove. */
const STALE_KEYS = [
  "octopus-market-ai-listings-v2",
  "octopus-market-tool-social-v3",
  "octopus-market-admin-notifications-v2",
];

/**
 * Removes stale localStorage keys left over from the pre-Supabase architecture.
 * Idempotent: marks itself done and no-ops on subsequent calls.
 */
export function runLocalStorageMigration(): void {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(MIGRATION_DONE_KEY) === "done") return;

  try {
    for (const key of STALE_KEYS) {
      window.localStorage.removeItem(key);
    }
    window.localStorage.setItem(MIGRATION_DONE_KEY, "done");
  } catch {
    // Best-effort — silently ignore storage errors
  }
}

/**
 * Migrates old agent memory from localStorage → Supabase if:
 *   - wallet is connected
 *   - old localStorage memory key exists
 *   - Supabase has no memory for this wallet yet (avoid overwriting newer data)
 *
 * Clears the old key after a successful migration.
 */
export async function migrateWalletMemory(walletAddress: string): Promise<void> {
  if (typeof window === "undefined") return;

  const raw = window.localStorage.getItem(LEGACY_MEMORY_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;

    // Only migrate if Supabase is empty for this wallet
    const existing = await getAgentMemory(walletAddress);
    if (existing) {
      // Supabase already has data — just clean the stale key
      window.localStorage.removeItem(LEGACY_MEMORY_KEY);
      return;
    }

    await saveAgentMemory(walletAddress, {
      user: {
        name: parsed.user?.name ?? null,
        age: parsed.user?.age ?? null,
        location: parsed.user?.location ?? null,
        profession: parsed.user?.profession ?? null,
      },
      preferences: {
        languagePreference: parsed.preferences?.languagePreference ?? "en",
        responseStyle: parsed.preferences?.responseStyle ?? null,
        tonePreference: parsed.preferences?.tonePreference ?? null,
        humorPreference: parsed.preferences?.humorPreference ?? null,
      },
      projectsInProgress: Array.isArray(parsed.projectsInProgress) ? parsed.projectsInProgress : [],
      currentGoals: Array.isArray(parsed.currentGoals) ? parsed.currentGoals : [],
      importantInformation: Array.isArray(parsed.importantInformation) ? parsed.importantInformation : [],
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    });

    window.localStorage.removeItem(LEGACY_MEMORY_KEY);
  } catch {
    // Best-effort — silently ignore
  }
}
