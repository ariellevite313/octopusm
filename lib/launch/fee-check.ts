/**
 * Serveur : les frais de création d'un token Solana ont-ils été payés ?
 * Exigé avant de co-signer la pool (cosign-send), de passer le token en actif (confirm) ou de le récupérer (recover-pool),
 * sinon on pouvait signer seulement TX B et lancer gratuitement.
 * Si fee_paid_at manque (record-fee-tx a échoué, ou lancement par l'API v1 / un wallet IA), on cherche le paiement
 * dans les transactions récentes du créateur, puis on l'enregistre.
 */
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { solanaConnection } from "@/lib/solana/rpc";
import { platformPubkey } from "@/lib/solana/dbc";
import { PLATFORM_FEE_SOL, SCHEDULED_FEE_SOL } from "@/lib/launch/platform-fee";

const MAX_AGE_MS = 2 * 3600_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensureLaunchFeePaid(admin: any, tokenId: string, hintSig?: string | null): Promise<boolean> {
  const { data: t } = await admin.from("launchpad_tokens").select("creator_wallet, is_scheduled, fee_paid_at").eq("id", tokenId).maybeSingle();
  if (!t) return false;
  if (t.fee_paid_at) return true;
  let creator: PublicKey;
  try { creator = new PublicKey(t.creator_wallet); } catch { return false; }
  const platform = platformPubkey().toBase58();
  const due = Math.floor(PLATFORM_FEE_SOL * LAMPORTS_PER_SOL) + (t.is_scheduled ? Math.floor(SCHEDULED_FEE_SOL * LAMPORTS_PER_SOL) : 0);
  const conn = solanaConnection();

  const sigs: string[] = [];
  if (hintSig && /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(hintSig)) sigs.push(hintSig);
  const recent = await conn.getSignaturesForAddress(creator, { limit: 25 }, "confirmed").catch(() => []);
  for (const r of recent) if (!r.err && r.blockTime && Date.now() - r.blockTime * 1000 < MAX_AGE_MS && !sigs.includes(r.signature)) sigs.push(r.signature);

  for (const sig of sigs.slice(0, 26)) {
    const tx = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }).catch(() => null);
    if (!tx?.meta || tx.meta.err !== null || !tx.blockTime || Date.now() - tx.blockTime * 1000 > MAX_AGE_MS) continue;
    const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta.loadedAddresses });
    if (keys.get(0)?.toBase58() !== creator.toBase58()) continue;
    let idx = -1;
    for (let i = 0; i < keys.length; i++) if (keys.get(i)?.toBase58() === platform) { idx = i; break; }
    if (idx < 0 || tx.meta.postBalances[idx] - tx.meta.preBalances[idx] < due) continue;
    // Une même tx ne paie qu'un seul token
    const { data: used } = await admin.from("launchpad_tokens").select("id").eq("fee_tx_sig", sig).neq("id", tokenId).limit(1);
    if (used?.length) continue;
    const { error } = await admin.from("launchpad_tokens").update({ fee_paid_at: new Date().toISOString(), fee_tx_sig: sig }).eq("id", tokenId).is("fee_paid_at", null);
    if (!error) return true;
  }
  return false;
}
