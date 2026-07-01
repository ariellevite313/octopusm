/**
 * avatar-service.ts
 * Upload / lecture / suppression des avatars utilisateur
 * Stockage : Supabase Storage bucket "avatars"
 * Persistance : wallets.avatar_src
 */

import { supabase } from "@/lib/supabase";

const BUCKET = "avatars";
const AVATAR_SIZE_PX = 256;
const AVATAR_QUALITY = 0.85;

/**
 * Redimensionne et compresse une image côté client avant upload.
 * Centre-crop carré → JPEG 256×256 ~20-50 KB.
 */
function resizeImageForAvatar(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const size = Math.min(img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = AVATAR_SIZE_PX;
      canvas.height = AVATAR_SIZE_PX;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas not supported")); return; }
      const sx = (img.width - size) / 2;
      const sy = (img.height - size) / 2;
      ctx.drawImage(img, sx, sy, size, size, 0, 0, AVATAR_SIZE_PX, AVATAR_SIZE_PX);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Compression failed"))),
        "image/jpeg",
        AVATAR_QUALITY
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Image load failed")); };
    img.src = objectUrl;
  });
}

/**
 * Upload un fichier image et met à jour wallets.avatar_src.
 * Compresse côté client avant upload (JPEG 256×256).
 * Retourne l'URL publique ou une erreur.
 */
export async function uploadAvatar(
  walletAddress: string,
  file: File
): Promise<{ url: string } | { error: string }> {
  // Toujours .jpg après compression Canvas → JPEG
  const path = `${walletAddress}/avatar.jpg`;

  let compressed: Blob;
  try {
    compressed = await resizeImageForAvatar(file);
  } catch {
    compressed = file; // fallback sur le fichier original si Canvas échoue
  }

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, compressed, { upsert: true, contentType: "image/jpeg" });

  if (uploadError) {
    console.error("[avatar-service] upload failed:", uploadError.message);
    return { error: uploadError.message };
  }

  // URL publique avec cache-busting : même path stocké = même URL brute,
  // le navigateur servirait l'ancienne image depuis son cache au rechargement.
  // On stocke donc l'URL avec le timestamp en DB pour que le rechargement
  // reçoive toujours l'URL de la dernière version uploadée.
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = `${data.publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await supabase
    .from("wallets")
    .update({ avatar_src: publicUrl })
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
