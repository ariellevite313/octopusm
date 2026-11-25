/** Discover : règles des fiches d'apps (validation partagée client et serveur, testée). */
import { cleanHttpsUrl } from "@/lib/https-url";

export const APP_CATEGORIES = ["ai", "defi", "gaming", "payments", "social", "tools", "nft", "other"] as const;
export type AppCategory = (typeof APP_CATEGORIES)[number];
export const APP_CATEGORY_LABEL: Record<AppCategory, string> = {
  ai: "AI", defi: "DeFi", gaming: "Games", payments: "Payments", social: "Social", tools: "Tools", nft: "NFT", other: "Other",
};
export const MAX_SCREENSHOTS = 6;
/** Prix normal d'une fiche Discover (par an). Gratuit pour l'instant : affiché barré avec la mention « Free ». */
export const LISTING_PRICE_USD = 80;
export const LISTING_FREE_NOW = true;
/** Raisons d'un signalement de projet */
export const REPORT_REASONS = ["asks_seed", "scam", "fake", "no_token_payment", "other"] as const;
export const REPORT_REASON_LABEL: Record<(typeof REPORT_REASONS)[number], string> = {
  asks_seed: "It asks for my recovery phrase (12 or 24 words)",
  scam: "Scam or theft of funds",
  fake: "Fake project or copies another one",
  no_token_payment: "The token is not used to pay",
  other: "Other",
};

export type AppInput = {
  tokenId?: unknown; name?: unknown; tagline?: unknown; description?: unknown; category?: unknown; siteUrl?: unknown;
  iconUrl?: unknown; bannerUrl?: unknown; screenshots?: unknown; paymentNote?: unknown; acceptsToken?: unknown;
};
export type ValidApp = {
  tokenId: string; name: string; tagline: string; description: string; category: AppCategory; siteUrl: string;
  iconUrl: string | null; bannerUrl: string | null; screenshots: string[]; paymentNote: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function validateApp(i: AppInput): { ok: true; value: ValidApp } | { ok: false; error: string } {
  const tokenId = str(i.tokenId);
  if (!UUID.test(tokenId)) return { ok: false, error: "Choose the OM token of your project" };
  const name = str(i.name);
  if (name.length < 2 || name.length > 40) return { ok: false, error: "Project name must be 2 to 40 characters" };
  const tagline = str(i.tagline);
  if (tagline.length < 5 || tagline.length > 80) return { ok: false, error: "Short description must be 5 to 80 characters" };
  const description = str(i.description);
  if (description.length < 20 || description.length > 2000) return { ok: false, error: "Description must be 20 to 2000 characters" };
  if (typeof i.category !== "string" || !(APP_CATEGORIES as readonly string[]).includes(i.category)) return { ok: false, error: "Invalid category" };
  const siteUrl = cleanHttpsUrl(i.siteUrl);
  if (!siteUrl) return { ok: false, error: "A valid https website is required" };
  const img = (v: unknown) => (v == null || v === "" ? null : cleanHttpsUrl(v, 500));
  const iconUrl = img(i.iconUrl), bannerUrl = img(i.bannerUrl);
  if ((i.iconUrl && !iconUrl) || (i.bannerUrl && !bannerUrl)) return { ok: false, error: "Invalid image link" };
  const raw = Array.isArray(i.screenshots) ? i.screenshots : [];
  if (raw.length > MAX_SCREENSHOTS) return { ok: false, error: `${MAX_SCREENSHOTS} images at most` };
  const screenshots: string[] = [];
  for (const s of raw) { const u = cleanHttpsUrl(s, 500); if (!u) return { ok: false, error: "Invalid image link" }; screenshots.push(u); }
  if (i.acceptsToken !== true) return { ok: false, error: "Your website must accept your token as payment" };
  const paymentNote = str(i.paymentNote);
  if (paymentNote.length < 10 || paymentNote.length > 200) return { ok: false, error: "Explain in 10 to 200 characters how your token is used to pay" };
  return { ok: true, value: { tokenId, name, tagline, description, category: i.category as AppCategory, siteUrl, iconUrl, bannerUrl, screenshots, paymentNote } };
}

export function validateReview(rating: unknown, body: unknown): { ok: true; rating: number; body: string | null } | { ok: false; error: string } {
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: "Choose 1 to 5 stars" };
  const b = typeof body === "string" ? body.trim() : "";
  if (b.length > 600) return { ok: false, error: "600 characters at most" };
  return { ok: true, rating, body: b || null };
}

/** Répartition des notes 5 → 1, en part du total (pour les barres). */
export function ratingBars(ratings: number[]): { star: number; count: number; pct: number }[] {
  const total = ratings.length || 1;
  return [5, 4, 3, 2, 1].map((star) => { const count = ratings.filter((r) => r === star).length; return { star, count, pct: Math.round((count / total) * 100) }; });
}
