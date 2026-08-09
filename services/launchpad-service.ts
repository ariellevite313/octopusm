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
  is_tradeable: boolean;
  metadata_uri: string | null;
  created_at: string;
  updated_at: string;
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
]);

export function isProtectedName(value: string): boolean {
  return PROTECTED_NAMES.has(value.trim().toUpperCase());
}

// ─── Tokens ────────────────────────────────────────────────────────────────

export async function getLaunchpadTokens({
  status,
  category,
  limit = 50,
  offset = 0,
}: {
  status?: LaunchpadToken["status"] | "coming_soon";
  category?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<LaunchpadToken[]> {
  const admin = createAdminClient() as ReturnType<typeof createAdminClient>;
  let q = admin
    .from("launchpad_tokens")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status === "coming_soon") {
    q = q.eq("is_scheduled", true).eq("is_tradeable", false);
  } else if (status) {
    q = q.eq("status", status);
  }

  if (category) q = q.eq("category", category);

  const { data } = await q;
  return (data ?? []) as LaunchpadToken[];
}

export async function getLaunchpadToken(id: string): Promise<LaunchpadToken | null> {
  const admin = createAdminClient() as ReturnType<typeof createAdminClient>;
  const { data } = await admin
    .from("launchpad_tokens")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data as LaunchpadToken | null;
}

export async function getLaunchpadTokenByMint(mint: string): Promise<LaunchpadToken | null> {
  const admin = createAdminClient() as ReturnType<typeof createAdminClient>;
  const { data } = await admin
    .from("launchpad_tokens")
    .select("*")
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

  // Vérifier réservations actives
  const { data: rawReservations } = await admin
    .from("token_reservations")
    .select("name, ticker")
    .eq("consumed", false)
    .gt("expires_at", now)
    .or(`name.ilike.${name},ticker.ilike.${ticker}`);
  const reservations = (rawReservations ?? []) as { name: string; ticker: string }[];

  // Vérifier tokens existants
  const { data: rawTokens } = await admin
    .from("launchpad_tokens")
    .select("name, ticker")
    .or(`name.ilike.${name},ticker.ilike.${ticker}`);
  const existingTokens = (rawTokens ?? []) as { name: string; ticker: string }[];

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
    .select("*")
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
