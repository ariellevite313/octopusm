// Photo de profil par défaut : Omero, pour tous les comptes sans photo (anciens compris)
export const DEFAULT_AVATAR = "/omero-default.jpg";

export function avatarOr(src?: string | null): string {
  return src && src.trim() ? src : DEFAULT_AVATAR;
}
