/**
 * Mise de départ d'un pool : la moitié des frais de création est misée par la maison (trésorerie d'OM)
 * sur une option tirée au hasard. Les fonds sont déjà dans la trésorerie : si la maison gagne, le gain y reste.
 */
import { POOL_SEED_CLT, POOL_SEED_USDC } from "@/lib/market/pool-fee";

export const HOUSE_WALLET = process.env.NEXT_PUBLIC_TREASURY_ADDRESS ?? "EsR6usyjCzhgL6dZFqHRsw6pDh7CgvfHtkQzCybJMuCZ";

/** Option tirée au hasard (crypto, pas Math.random) */
export function pickSeedOption(ids: string[]): string {
  if (!ids.length) throw new Error("no options");
  const r = crypto.getRandomValues(new Uint32Array(1))[0];
  return ids[r % ids.length];
}

export function seedAmount(betToken: string): number {
  return betToken === "clawdtrust" ? POOL_SEED_CLT : POOL_SEED_USDC;
}

/** Ajoute la mise de départ au pool (ne bloque jamais la création : les erreurs sont seulement journalisées). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function seedPool(admin: any, market: { id: string; options: { id: string }[]; bet_token: string }): Promise<string | null> {
  try {
    const token = market.bet_token === "clawdtrust" ? "clawdtrust" : "usdc";
    const amount = seedAmount(token);
    const option_id = pickSeedOption(market.options.map((o) => o.id));
    // La trésorerie doit exister dans wallets (clé étrangère des mises)
    const { data: w } = await admin.from("wallets").select("address").eq("address", HOUSE_WALLET).maybeSingle();
    if (!w) {
      const now = new Date().toISOString();
      await admin.from("wallets").insert({
        address: HOUSE_WALLET, role: "user", status: "active", first_connected_at: now, last_connected_at: now, connection_count: 0,
        latest_activity_at: now, latest_activity_label: "Pool seed", payment_count: 0, approved_payment_count: 0,
        pending_payment_count: 0, rejected_payment_count: 0, total_paid_usdc: 0, total_won_usdc: 0, total_lost_usdc: 0, total_claimed_usdc: 0,
      });
    }
    const { error } = await admin.from("mutuel_bets").insert({
      market_id: market.id, wallet_address: HOUSE_WALLET, option_id, amount, token,
      tx_signature: `house_seed:${market.id}`, status: "approved",
    });
    if (error) { console.error("[pool-seed]", error.message); return null; }
    const { error: rpcErr } = await admin.rpc("increment_pool_total", { p_market_id: market.id, p_token: token, p_amount: amount });
    if (rpcErr) console.error("[pool-seed] total", rpcErr.message);
    return option_id;
  } catch (e) {
    console.error("[pool-seed]", e);
    return null;
  }
}
