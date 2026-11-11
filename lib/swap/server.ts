/** Serveur : frais applicables à une paire (0 pour les tokens lancés sur OM). */
import { createAdminClient } from "@/lib/supabase/server";
import { SWAP_FEE_BPS, tradedMint } from "./core";

const cache = new Map<string, { at: number; om: boolean }>();

export async function isOmToken(mint: string): Promise<boolean> {
  const hit = cache.get(mint);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.om;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db.from("launchpad_tokens").select("id").eq("mint_address", mint).limit(1).maybeSingle();
  const om = !!data;
  cache.set(mint, { at: Date.now(), om });
  if (cache.size > 5000) cache.delete(cache.keys().next().value as string);
  return om;
}

export async function feeBpsFor(inputMint: string, outputMint: string): Promise<number> {
  return (await isOmToken(tradedMint(inputMint, outputMint))) ? 0 : SWAP_FEE_BPS;
}
