/** Analyse du texte d'un post : #hashtags, @mentions, lien vers un marché OMdotfun. */
export const HASHTAG_RE = /(^|[^\p{L}\p{N}_&])#([\p{L}\p{N}_]{2,30})/gu;
export const MENTION_RE = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{2,30})/g;
export const MARKET_URL_RE = /(?:https?:\/\/[^\s/]+)?\/(pools|prediction)\/([A-Za-z0-9][A-Za-z0-9-]{0,120})/;

export function extractTags(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(HASHTAG_RE)) { out.add(m[2].toLowerCase()); if (out.size >= 10) break; }
  return [...out];
}

export function extractMentions(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(MENTION_RE)) { out.add(m[2]); if (out.size >= 10) break; }
  return [...out];
}

export function extractMarketRef(body: string): { kind: "pool" | "prediction"; key: string } | null {
  const m = body.match(MARKET_URL_RE);
  if (!m) return null;
  return { kind: m[1] === "pools" ? "pool" : "prediction", key: m[2] };
}
