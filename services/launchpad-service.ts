import { createAdminClient } from "@/lib/supabase/server";

export type LaunchpadToken = {
  id: string;
  name: string;
  ticker: string;
  category: string;
  description: string | null;
  logo_url: string | null;
  whitepaper_url: string | null;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  discord: string | null;
  other_social: string | null;
  mint_address: string | null;
  pool_address: string | null;
  creator_wallet: string;
  supply: number;
  creator_fee_pct: number;
  platform_fee_pct: number;
  fee_recipients: { address: string; share_pct: number }[] | null;
  share_top100: boolean;
  share_top100_pct: number | null;
  is_scheduled: boolean;
  scheduled_at: string | null;
  first_buy_amount: number | null;
  status: "pending" | "active" | "graduating" | "graduated" | "cancelled";
  is_verified: boolean;
  is_tradeable: boolean;
  metadata_uri: string | null;
  created_at: string;
  updated_at: string;
  creator_display_name?: string | null;
  creator_verified?: boolean;
};

export type TokenReservation = {
  id: string;
  wallet_address: string;
  name: string;
  ticker: string;
  paid_sol: number;
  tx_signature: string | null;
  expires_at: string;
  consumed: boolean;
  created_at: string;
};

// Noms protégés (côté serveur — source de vérité)
export const PROTECTED_NAMES = new Set([
  "OM", "OCTO", "CLAWDTRUST", "OCTOPUS MARKET",
  "OCTOMARKET", "OMDOTFUN", "OMFUN", "BYOM", "CLAWD", "TRUST",
  "OMERO", "OMEROINNU", "OMERO INU",
]);

export function isProtectedName(value: string): boolean {
  return PROTECTED_NAMES.has(value.trim().toUpperCase());
}

// Colonnes publiques — exclut vanity_secret_key, tx_base64, tx_prepared_at, vanity_job_id
const PUBLIC_COLUMNS = [
  "id","name","ticker","category","description","logo_url","whitepaper_url",
  "website","twitter","telegram","discord","other_social",
  "mint_address","pool_address","creator_wallet","supply",
  "creator_fee_pct","platform_fee_pct","fee_recipients",
  "share_top100","share_top100_pct","is_scheduled","scheduled_at",
  "first_buy_amount","status","is_verified","is_tradeable","metadata_uri",
  "created_at","updated_at",
].join(",");

// Colonnes publiques pour token_reservations (colonnes différentes de launchpad_tokens)
const RESERVATION_COLUMNS = [
  "id","wallet_address","name","ticker","paid_sol","tx_signature",
  "expires_at","consumed","created_at",
].join(",");

// ─── Tokens ────────────────────────────────────────────────────────────────

export async function getLaunchpadTokens({
  status,
  excludeStatuses,
  category,
  limit = 50,
  offset = 0,
}: {
  status?: LaunchpadToken["status"] | "coming_soon";
  excludeStatuses?: LaunchpadToken["status"][];
  category?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<LaunchpadToken[]> {
  const admin = createAdminClient() as ReturnType<typeof createAdminClient>;
  let q = admin
    .from("launchpad_tokens")
    .select(PUBLIC_COLUMNS)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status === "coming_soon") {
    q = q.eq("is_scheduled", true).eq("is_tradeable", false);
  } else if (status) {
    q = q.eq("status", status);
  }

  if (excludeStatuses && excludeStatuses.length > 0) {
    q = q.not("status", "in", `(${excludeStatuses.join(",")})`);
  }

  if (category) q = q.eq("category", category);

  const { data } = await q;
  const tokens = (data ?? []) as LaunchpadToken[];

  // Batch-fetch creator display names from wallets table
  const wallets = [...new Set(tokens.map(t => t.creator_wallet).filter(Boolean))];
  if (wallets.length > 0) {
    const { data: walletRows } = await admin
      .from("wallets")
      .select("address, display_name, is_creator_verified")
      .in("address", wallets);
    if (walletRows) {
      const nameMap     = new Map((walletRows as { address: string; display_name: string | null; is_creator_verified: boolean }[]).map(w => [w.address, w]));
      tokens.forEach(t => {
        const w = nameMap.get(t.creator_wallet);
        t.creator_display_name = w?.display_name ?? null;
        t.creator_verified     = w?.is_creator_verified ?? false;
      });
    }
  }

  return tokens;
}

export async function getLaunchpadToken(id: string): Promise<LaunchpadToken | null> {
  const admin = createAdminClient() as ReturnType<typeof createAdminClient>;
  const { data } = await admin
    .from("launchpad_tokens")
    .select(PUBLIC_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  return data as LaunchpadToken | null;
}

export async function getLaunchpadTokenByMint(mint: string): Promise<LaunchpadToken | null> {
  const admin = createAdminClient() as ReturnType<typeof createAdminClient>;
  const { data } = await admin
    .from("launchpad_tokens")
    .select(PUBLIC_COLUMNS)
    .eq("mint_address", mint)
    .maybeSingle();
  return data as LaunchpadToken | null;
}

// ─── Réservations ──────────────────────────────────────────────────────────

export async function checkNameAvailability(name: string, ticker: string): Promise<{
  nameAvailable: boolean;
  tickerAvailable: boolean;
}> {
  const admin = createAdminClient() as ReturnType<typeof createAdminClient>;
  const now = new Date().toISOString();

  // Vérifier nom protégé
  if (isProtectedName(name) || isProtectedName(ticker)) {
    return { nameAvailable: false, tickerAvailable: false };
  }

  // Vérifier réservations actives — deux requêtes séparées pour éviter l'injection via .or()
  const [{ data: resName }, { data: resTicker }] = await Promise.all([
    admin.from("token_reservations").select("name, ticker").eq("consumed", false).gt("expires_at", now).ilike("name", name),
    admin.from("token_reservations").select("name, ticker").eq("consumed", false).gt("expires_at", now).ilike("ticker", ticker),
  ]);
  const reservations = ([...(resName ?? []), ...(resTicker ?? [])]) as { name: string; ticker: string }[];

  // Vérifier tokens existants — deux requêtes séparées
  const [{ data: tokName }, { data: tokTicker }] = await Promise.all([
    admin.from("launchpad_tokens").select("name, ticker").ilike("name", name),
    admin.from("launchpad_tokens").select("name, ticker").ilike("ticker", ticker),
  ]);
  const existingTokens = ([...(tokName ?? []), ...(tokTicker ?? [])]) as { name: string; ticker: string }[];

  const takenNames = new Set([
    ...reservations.map((r) => r.name.toLowerCase()),
    ...existingTokens.map((t) => t.name.toLowerCase()),
  ]);
  const takenTickers = new Set([
    ...reservations.map((r) => r.ticker.toLowerCase()),
    ...existingTokens.map((t) => t.ticker.toLowerCase()),
  ]);

  return {
    nameAvailable: !takenNames.has(name.toLowerCase()),
    tickerAvailable: !takenTickers.has(ticker.toLowerCase()),
  };
}

export async function getActiveReservation(wallet: string): Promise<TokenReservation | null> {
  const admin = createAdminClient() as ReturnType<typeof createAdminClient>;
  const { data } = await admin
    .from("token_reservations")
    .select(RESERVATION_COLUMNS)
    .eq("wallet_address", wallet)
    .eq("consumed", false)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as TokenReservation | null;
}

// ─── Watchlist ─────────────────────────────────────────────────────────────

export async function getWatchlistCount(tokenId: string): Promise<number> {
  const admin = createAdminClient() as ReturnType<typeof createAdminClient>;
  const { count } = await admin
    .from("launchpad_watchlist")
    .select("*", { count: "exact", head: true })
    .eq("token_id", tokenId);
  return count ?? 0;
}
