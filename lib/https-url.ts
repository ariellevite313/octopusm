/** Adresse web sûre : seules les URLs https:// sans identifiants sont acceptées. Pur, utilisable côté navigateur. */
export function cleanHttpsUrl(v: unknown, max = 300): string | null {
  if (typeof v !== "string" || v.length > max) return null;
  try {
    const u = new URL(v.trim());
    if (u.protocol !== "https:" || u.username || u.password) return null;
    return u.toString();
  } catch { return null; }
}
