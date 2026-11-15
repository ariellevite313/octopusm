/**
 * Tickers réservés (les 100 premiers DRC-20 natifs) : personne ne peut les lancer sur OM, sauf l'équipe du projet.
 * L'équipe envoie une demande (ticker_requests) ; l'admin vérifie (compte X du projet) puis ajoute son wallet.
 * Sans la migration 20261127_reserved_tickers.sql, rien n'est bloqué.
 */
import { createAdminClient } from "@/lib/supabase/server";

export const normTicker = (t: string) => String(t ?? "").trim().replace(/^\$+/, "").toUpperCase();

export type ReservedInfo = { reserved: false } | { reserved: true; allowed: boolean; original: string; xHandle: string | null };

export async function reservedTicker(ticker: string, wallet?: string | null): Promise<ReservedInfo> {
  const t = normTicker(ticker);
  if (!t) return { reserved: false };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db.from("reserved_tickers").select("original, x_handle, allowed_wallets").eq("ticker", t).maybeSingle();
  if (error || !data) return { reserved: false };
  const allowed = !!wallet && ((data.allowed_wallets ?? []) as string[]).some((w) => w.toLowerCase() === wallet.toLowerCase());
  return { reserved: true, allowed, original: data.original, xHandle: data.x_handle ?? null };
}
