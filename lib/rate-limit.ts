/**
 * Limite de requêtes partagée via la base (fonction SQL rl_hit) ; repli en mémoire si la base ne répond pas.
 * À utiliser pour les limites sensibles (par heure : lancements, trades, inscriptions OAuth).
 */
import { createAdminClient } from "@/lib/supabase/server";
import { hit as memoryHit } from "@/lib/v1/launch";

/** Vrai si l'appel est autorisé. */
export async function rateHit(key: string, max: number, windowMs: number): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (createAdminClient() as any).rpc("rl_hit", { p_key: key, p_max: max, p_window_ms: windowMs });
    if (error) throw new Error(error.message);
    return data === true;
  } catch {
    return memoryHit(key, max, windowMs);
  }
}
