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
/** Fiche avec token OM : gratuite jusqu'à cette date, puis 80 $ par an. */
export const LISTING_FREE_UNTIL = "2027-01-01T00:00:00Z";
export const LISTING_FREE_NOW = Date.now() < Date.parse(LISTING_FREE_UNTIL);
/** Fiche sans token OM : payante (USDC sur Solana, pour un an). L'admin liste sans token et sans payer. */
export const NO_TOKEN_PRICE_USD = 80;
export const NO_TOKEN_DAYS = 365;
export const NETWORKS = ["solana", "arc", "base", "bnb", "ethereum", "other"] as const;
export type Network = (typeof NETWORKS)[number];
export const NETWORK_LABEL: Record<Network, string> = { solana: "Solana", arc: "Arc", base: "Base", bnb: "BNB Chain", ethereum: "Ethereum", other: "Other" };

/** Boost : mise en avant dans « Recommandés », payée uniquement en Omero. */
export const BOOST_COST_OMERO = 500;
export const BOOST_DAYS = 7;
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
  /** true : fiche sans token OM (payante, sauf pour l'admin) */
  noToken?: unknown; network?: unknown;
  /** Réseaux sociaux, facultatifs */
  xUrl?: unknown; telegramUrl?: unknown; discordUrl?: unknown;
};
export type ValidApp = {
  tokenId: string | null; name: string; tagline: string; description: string; category: AppCategory; siteUrl: string;
  iconUrl: string | null; bannerUrl: string | null; screenshots: string[]; paymentNote: string | null; network: Network | null;
  xUrl: string | null; telegramUrl: string | null; discordUrl: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Lien social facultatif : vide = null, sinon https sur le bon domaine. */
const SOCIAL_HOSTS = { x: ["x.com", "twitter.com"], telegram: ["t.me", "telegram.me"], discord: ["discord.gg", "discord.com"] } as const;
export function socialUrl(v: unknown, kind: keyof typeof SOCIAL_HOSTS): string | null | false {
  if (v == null || (typeof v === "string" && v.trim() === "")) return null;
  const u = cleanHttpsUrl(v, 200);
  if (!u) return false;
  const host = new URL(u).hostname.replace(/^www\./, "");
  return (SOCIAL_HOSTS[kind] as readonly string[]).includes(host) ? u : false;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function validateApp(i: AppInput): { ok: true; value: ValidApp } | { ok: false; error: string } {
  const noToken = i.noToken === true;
  const tokenId = noToken ? null : str(i.tokenId);
  if (tokenId !== null && !UUID.test(tokenId)) return { ok: false, error: "Choose the OM token of your project" };
  let network: Network | null = null;
  if (noToken) {
    if (typeof i.network !== "string" || !(NETWORKS as readonly string[]).includes(i.network)) return { ok: false, error: "Choose the network of your project" };
    network = i.network as Network;
  }
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
  let paymentNote: string | null = null;
  if (!noToken) {
    if (i.acceptsToken !== true) return { ok: false, error: "Your website must accept your token as payment" };
    paymentNote = str(i.paymentNote);
    if (paymentNote.length < 10 || paymentNote.length > 200) return { ok: false, error: "Explain in 10 to 200 characters how your token is used to pay" };
  }
  const xUrl = socialUrl(i.xUrl, "x"), telegramUrl = socialUrl(i.telegramUrl, "telegram"), discordUrl = socialUrl(i.discordUrl, "discord");
  if (xUrl === false) return { ok: false, error: "Invalid X link" };
  if (telegramUrl === false) return { ok: false, error: "Invalid Telegram link" };
  if (discordUrl === false) return { ok: false, error: "Invalid Discord link" };
  return { ok: true, value: { tokenId, name, tagline, description, category: i.category as AppCategory, siteUrl, iconUrl, bannerUrl, screenshots, paymentNote, network, xUrl, telegramUrl, discordUrl } };
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
