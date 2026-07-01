/**
 * avatar-service.ts
 * Upload / lecture / suppression des avatars utilisateur
 * Stockage : Supabase Storage bucket "avatars"
 * Persistance : wallets.avatar_src
 */

import { supabase } from "@/lib/supabase";

const BUCKET = "avatars";

/**
 * Upload un fichier image et met à jour wallets.avatar_src.
 * Retourne l'URL publique ou null en cas d'erreur.
 */
export async function uploadAvatar(
  walletAddress: string,
  file: File
): Promise<{ url: string } | { error: string }> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${walletAddress}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) {
    console.error("[avatar-service] upload failed:", uploadError.message);
    return { error: uploadError.message };
  }

  // URL publique avec cache-busting : même path = même URL sans le parametre,
  // le navigateur servirait l'ancienne image depuis son cache.
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = `${data.publicUrl}?t=${Date.now()}`;

  // Persister dans wallets.avatar_src (sans le cache-buster pour l'URL en DB)
  const cleanUrl = data.publicUrl;
  const { error: updateError } = await supabase
    .from("wallets")
    .update({ avatar_src: cleanUrl })
    .eq("address", walletAddress);

  if (updateError) {
    console.error("[avatar-service] wallets update failed:", updateError.message);
  }

  // Retourner l'URL avec cache-buster pour la session courante
  return { url: publicUrl };
}

/**
 * Lit avatar_src depuis la table wallets.
 * Retourne null si pas d'avatar ou erreur.
 */
export async function getAvatarUrl(walletAddress: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("wallets")
    .select("avatar_src")
    .eq("address", walletAddress)
    .maybeSingle();

  if (error) {
    console.error("[avatar-service] getAvatarUrl failed:", error.message);
    return null;
  }

  return data?.avatar_src ?? null;
}

/**
 * Supprime l'avatar et vide avatar_src dans wallets.
 */
export async function deleteAvatar(walletAddress: string): Promise<void> {
  // On tente de supprimer les extensions communes
  const paths = ["jpg", "jpeg", "png", "webp", "gif"].map(
    (ext) => `${walletAddress}/avatar.${ext}`
  );

  await supabase.storage.from(BUCKET).remove(paths);

  await supabase
    .from("wallets")
    .update({ avatar_src: null })
    .eq("address", walletAddress);
}
