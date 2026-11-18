/**
 * Serveur : marque un message signé comme consommé, une seule fois pour toutes les instances (table used_signatures).
 * La clé est le hash du wallet et du MESSAGE signé, pas de la signature : réencoder la signature ne permet plus de la rejouer.
 */
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";

const mem = new Map<string, number>();

/** true : première utilisation. false : déjà utilisé. */
export async function useOnce(scope: string, wallet: string, message: string): Promise<boolean> {
  const key = createHash("sha256").update(`${scope}\n${wallet.toLowerCase()}\n${message}`, "utf8").digest("hex");
  if (mem.has(key)) return false;
  mem.set(key, Date.now());
  if (mem.size > 5000) mem.clear();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (createAdminClient() as any).from("used_signatures").insert({ key });
    if (!error) return true;
    if (error.code === "23505") return false;
    // Table absente ou base injoignable : la protection en mémoire (ci-dessus) reste active
    if (error.code !== "42P01") console.error("[used-once]", error.message);
    return true;
  } catch { return true; }
}
