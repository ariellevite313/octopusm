/** Côté navigateur : retient de quel post vient un visiteur pour un marché (7 jours). */
const KEY = (marketId: string) => `om_via:${marketId}`;
const TTL = 7 * 86_400_000;

export function saveVia(marketId: string, postId: string | null) {
  if (!postId || !/^[0-9a-f-]{36}$/i.test(postId)) return;
  try { localStorage.setItem(KEY(marketId), JSON.stringify({ postId, at: Date.now() })); } catch { /* stockage indisponible */ }
}

export function readVia(marketId: string): string | undefined {
  try {
    const raw = localStorage.getItem(KEY(marketId));
    if (!raw) return undefined;
    const v = JSON.parse(raw) as { postId: string; at: number };
    return Date.now() - v.at < TTL ? v.postId : undefined;
  } catch { return undefined; }
}

/** À appeler sur la page d'un marché : enregistre ?via=<post> s'il est présent. */
export function captureVia(marketId: string) {
  if (typeof window === "undefined") return;
  saveVia(marketId, new URLSearchParams(window.location.search).get("via"));
}
