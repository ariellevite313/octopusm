/**
 * Serveur : une transaction de paiement ne sert qu'une seule fois, tous flux confondus (table used_payments).
 * claimPayment réserve la transaction ; si l'enregistrement qui suit échoue, releasePayment la libère pour un nouvel essai.
 */
import { createAdminClient } from "@/lib/supabase/server";

const norm = (tx: string) => (tx.startsWith("0x") ? tx.toLowerCase() : tx);
const chainOf = (tx: string) => (tx.startsWith("0x") ? "arc" : "solana");

/** true : transaction réservée pour ce flux. false : déjà utilisée ailleurs. Si la table manque encore, on laisse passer. */
export async function claimPayment(tx: string, flow: string, wallet?: string | null): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (createAdminClient() as any).from("used_payments").insert({ chain: chainOf(tx), tx_id: norm(tx), flow, wallet: wallet ?? null });
  if (!error) return true;
  if (error.code === "23505") return false;
  if (error.code === "42P01") { console.warn("[used_payments] table missing, run migration 20261128"); return true; }
  console.error("[used_payments]", error.message);
  return false;
}

export async function releasePayment(tx: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (createAdminClient() as any).from("used_payments").delete().eq("chain", chainOf(tx)).eq("tx_id", norm(tx));
}
