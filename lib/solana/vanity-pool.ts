import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import type { SupabaseClient } from "@supabase/supabase-js";

export const VANITY_SUFFIX = "om";

/**
 * Prend une clé « …om » dans le stock (réservation atomique).
 * Retourne null si le stock est vide ou en cas de problème : le lancement
 * continue alors avec une adresse normale, il n'est jamais bloqué.
 */
export async function claimVanityKeypair(admin: SupabaseClient, tokenId: string): Promise<Keypair | null> {
  try {
    const { data, error } = await admin.rpc("claim_vanity_keypair", { p_token_id: tokenId });
    if (error) return null;
    const row = (Array.isArray(data) ? data[0] : data) as { pub_key?: string; sec_key?: string | null } | null;
    if (!row?.pub_key || !row.sec_key) return null;
    const kp = Keypair.fromSecretKey(bs58.decode(row.sec_key));
    // Garde-fou : la clé doit correspondre à l'adresse annoncée et finir par « om »
    if (kp.publicKey.toBase58() !== row.pub_key || !row.pub_key.endsWith(VANITY_SUFFIX)) return null;
    return kp;
  } catch {
    return null;
  }
}
