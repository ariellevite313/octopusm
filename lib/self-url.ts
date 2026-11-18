/**
 * Adresse pour qu'une route appelle une autre route du même serveur.
 * On ne la déduit jamais de l'en-tête Host de la requête (falsifiable derrière certains proxys).
 * Sur notre serveur (pm2), l'appel reste local : il ne repasse pas par Internet et n'est pas compté dans les limites par IP.
 */
export function selfUrl(): string {
  if (process.env.INTERNAL_BASE_URL) return process.env.INTERNAL_BASE_URL.replace(/\/$/, "");
  if (process.env.VERCEL || process.env.NETLIFY) return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://omdot.fun").replace(/\/$/, "");
  return `http://127.0.0.1:${process.env.PORT ?? 3000}`;
}
