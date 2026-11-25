// Photo de profil par défaut : le chien bleu, pour tous les comptes sans photo (anciens compris)
export const DEFAULT_AVATAR = "/default-avatar.jpg";

export function avatarOr(src?: string | null): string {
  return src && src.trim() ? src : DEFAULT_AVATAR;
}
