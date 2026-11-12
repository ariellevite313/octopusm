/** Serveur : frais applicables à une paire (0 pour les tokens lancés sur OM). */
import { createAdminClient } from "@/lib/supabase/server";
import { SWAP_FEE_BPS, tradedMint } from "./core";
import { MAJOR_FEE_BPS, isMajorSolana } from "./majors";

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

/** Frais OM : 0,3 % ; 0,03 % sur les tokens majeurs ; 0 % sur les tokens OM, sauf via un post « Chill ton sac » (0,3 % dont 40 % au détenteur). */
export async function feeBpsFor(inputMint: string, outputMint: string, withRef = false): Promise<number> {
  const traded = tradedMint(inputMint, outputMint);
  if (isMajorSolana(traded)) return MAJOR_FEE_BPS;
  if (withRef) return SWAP_FEE_BPS;
  return (await isOmToken(traded)) ? 0 : SWAP_FEE_BPS;
}
