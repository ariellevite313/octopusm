/**
 * Wallets d'IA inactifs : 30 jours sans activité, et tout le solde revient au wallet de l'humain (jamais ailleurs).
 * Activité = la plus récente de : création du wallet, dernière action de l'IA (hors retraits), dernière connexion de l'humain
 * à OM, dernière fois qu'il a ouvert ou réglé son wallet d'IA. Un dépôt récent compte aussi : l'humain qui dépose est connecté.
 */
import { withdrawAll } from "@/lib/agent-wallet/server";

export const IDLE_DAYS = 30;
const DAY = 86_400_000;

/** Vrai si la dernière activité remonte à IDLE_DAYS jours ou plus */
export function isIdle(signals: (string | number | Date | null | undefined)[], now = Date.now()): boolean {
  const times = signals.map((s) => (s == null ? NaN : new Date(s).getTime())).filter((t) => Number.isFinite(t));
  // Sans aucune date lisible, on ne touche à rien
  if (times.length === 0) return false;
  return now - Math.max(...times) >= IDLE_DAYS * DAY;
}

type W = { id: string; owner: string; created_at: string; last_seen_at: string | null };

/** Renvoie les fonds des wallets d'IA inactifs. Appelé chaque jour par le cron. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sweepIdleWallets(db: any, deadline: number): Promise<{ checked: number; swept: number; failed: number }> {
  const cutoff = new Date(Date.now() - IDLE_DAYS * DAY).toISOString();
  // Pré-filtre : seuls les wallets créés ou ouverts il y a plus de 30 jours peuvent être inactifs
  const { data } = await db.from("agent_wallets").select("id, owner, created_at, last_seen_at").lt("created_at", cutoff).lt("last_seen_at", cutoff).limit(200);
  const wallets = (data ?? []) as W[];
  let swept = 0, failed = 0, checked = 0;
  for (const w of wallets) {
    if (Date.now() > deadline) break;
    checked++;
    const [{ data: act }, { data: me }] = await Promise.all([
      db.from("agent_wallet_actions").select("created_at").eq("wallet_id", w.id).neq("kind", "withdraw").neq("status", "failed").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("wallets").select("last_connected_at, latest_activity_at").eq("address", w.owner).maybeSingle(),
    ]);
    if (!isIdle([w.created_at, w.last_seen_at, act?.created_at, me?.last_connected_at, me?.latest_activity_at])) continue;
    try {
      await withdrawAll(w.owner, w.id);
      swept++;
    } catch (e) {
      // « Nothing to withdraw » : wallet déjà vide, rien à faire
      if (!/nothing to withdraw/i.test((e as Error).message)) failed++;
    }
  }
  return { checked, swept, failed };
}
