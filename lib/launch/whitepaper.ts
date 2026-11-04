/** Whitepaper des tokens : règles communes à l'envoi avant lancement et à la création. */
// 1 Mo (un peu sous 1 Mio) : passe sous la limite par défaut des serveurs web (nginx, 1 Mio par requête).
export const MAX_WHITEPAPER_BYTES = 1_000_000;
export const MAX_LOGO_BYTES = 1_000_000;

/** Un vrai PDF commence par « %PDF- » (on ne se fie ni à l'extension ni au type annoncé). */
export function looksLikePdf(buf: ArrayBuffer): boolean {
  const b = new Uint8Array(buf, 0, Math.min(5, buf.byteLength));
  return b.length === 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d;
}

/** L'URL d'un whitepaper déjà envoyé n'est acceptée que si elle vient de notre propre stockage. */
export function isOwnWhitepaperUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  return !!base && url.startsWith(`${base}/storage/v1/object/public/market-images/whitepapers/`) && url.endsWith(".pdf");
}
