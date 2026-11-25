/**
 * Avant d'afficher les frais à réclamer : un token Solana resté « pending » alors que sa pool
 * existe sur la chaîne est activé (pool retrouvée), pour que le créateur voie et réclame ses frais.
 */
import { activateIfPoolExists, type PendingToken } from "@/lib/launch/recover-pool";

const COLS = "id, status, creator_wallet, mint_address, tx_base64, is_scheduled, stock_symbol, dbc_config_address, created_at, chain";
const OLD_ENOUGH_MS = 60_000;

type Row = PendingToken & { created_at: string | null; chain: string | null };

const stuck = (t: Row) =>
  t.status === "pending" && !!t.mint_address && (t.chain ?? "solana") === "solana" &&
  (!t.created_at || Date.now() - new Date(t.created_at).getTime() > OLD_ENOUGH_MS);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tryActivate(admin: any, t: Row): Promise<string | null> {
  try { return await activateIfPoolExists(admin, t); } catch { return null; }
}

/** Tous les tokens bloqués d'un créateur. Renvoie les ids activés. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensurePoolsForWallet(admin: any, wallet: string): Promise<string[]> {
  const { data } = await admin.from("launchpad_tokens").select(COLS).eq("creator_wallet", wallet).eq("status", "pending").limit(10);
  const rows = ((data ?? []) as Row[]).filter(stuck);
  const done = await Promise.all(rows.map(async (t) => (await tryActivate(admin, t)) ? t.id : null));
  return done.filter((x): x is string => !!x);
}

/** Un token : renvoie l'adresse de la pool si elle a été retrouvée maintenant. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensurePoolForToken(admin: any, tokenId: string): Promise<string | null> {
  const { data } = await admin.from("launchpad_tokens").select(COLS).eq("id", tokenId).maybeSingle();
  if (!data || !stuck(data as Row)) return null;
  return tryActivate(admin, data as Row);
}
