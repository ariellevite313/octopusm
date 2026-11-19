/**
 * Sorties automatiques du wallet de l'IA (Janus), Solana : stop loss, take profit, protection des gains (trailing).
 * L'humain fixe ses règles (page de son wallet IA) ; l'IA ne les crée ni ne les change. Le cron les surveille chaque minute et vend avec le wallet de l'IA. Les vérifications
 * du wallet restent valables (pause, permission de trader) : si l'humain met le wallet en pause, rien ne se vend.
 * Le prix vient de DexScreener. Pour éviter une vente sur un prix aberrant d'un instant, le seuil doit être franchi
 * deux minutes de suite avant la vente.
 */
import { PublicKey } from "@solana/web3.js";
import { solanaConnection } from "@/lib/solana/rpc";
import { aiSwap, AgentWalletError, type AgentWallet } from "@/lib/agent-wallet/server";
import { bestPair } from "@/lib/swap/jup-trigger";

export type ExitRule = {
  id: string; wallet_id: string; mint: string; symbol: string | null; entry_price: number; peak_price: number;
  sl_pct: number | null; tp_x: number | null; tp_sell_pct: number; trail_pct: number | null; tp_done: boolean; trigger_hits: number;
  fail_count: number; last_attempt_at: string | null; last_error: string | null; status: string; close_reason: string | null; created_at: string;
};
export type ExitAction = { kind: "stop_loss" | "trailing" | "take_profit"; sellPct: number };

/** Nombre de contrôles de suite où le seuil doit être franchi avant de vendre */
export const CONFIRM_HITS = 2;
const MAX_FAILS = 10;
const MAX_RULES_PER_WALLET = 20;

/** Pur : que faire au prix actuel ? Le plus haut atteint est mis à jour dans tous les cas. */
export function evaluateExit(r: Pick<ExitRule, "entry_price" | "peak_price" | "sl_pct" | "tp_x" | "tp_sell_pct" | "trail_pct" | "tp_done">, price: number): { peak: number; action: ExitAction | null } {
  const peak = Math.max(Number(r.peak_price), price);
  const entry = Number(r.entry_price);
  if (!(price > 0)) return { peak, action: null };
  if (r.sl_pct != null && price <= entry * (1 - Number(r.sl_pct) / 100)) return { peak, action: { kind: "stop_loss", sellPct: 100 } };
  // Protection des gains : n'agit qu'une fois le prix passé au-dessus de l'entrée, puis suit le plus haut atteint
  if (r.trail_pct != null && peak > entry && price <= peak * (1 - Number(r.trail_pct) / 100)) return { peak, action: { kind: "trailing", sellPct: 100 } };
  if (r.tp_x != null && !r.tp_done && price >= entry * Number(r.tp_x)) return { peak, action: { kind: "take_profit", sellPct: Number(r.tp_sell_pct) } };
  return { peak, action: null };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = async (): Promise<any> => (await import("@/lib/supabase/server")).createAdminClient();

async function tokenBalance(owner: string, mint: string): Promise<{ raw: bigint; decimals: number }> {
  const r = await solanaConnection().getParsedTokenAccountsByOwner(new PublicKey(owner), { mint: new PublicKey(mint) });
  let raw = 0n, decimals = 0;
  for (const a of r.value) {
    const t = (a.account.data as { parsed?: { info?: { tokenAmount?: { amount?: string; decimals?: number } } } }).parsed?.info?.tokenAmount;
    if (t?.amount) { raw += BigInt(t.amount); decimals = t.decimals ?? decimals; }
  }
  return { raw, decimals };
}

export type ExitInput = { mint: string; stop_loss_pct?: number; take_profit_x?: number; take_profit_sell_pct?: number; trailing_pct?: number; symbol?: string };

/** Crée la règle d'une position détenue : le prix d'entrée est le prix actuel. Remplace la règle active du même token. */
export async function setExit(w: AgentWallet, i: ExitInput): Promise<ExitRule> {
  const num = (v: unknown, lo: number, hi: number, name: string) => {
    if (v === undefined || v === null) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < lo || n > hi) throw new AgentWalletError(`${name} must be between ${lo} and ${hi}`);
    return n;
  };
  const sl = num(i.stop_loss_pct, 1, 90, "stop_loss_pct"), tp = num(i.take_profit_x, 1.1, 1000, "take_profit_x");
  const tps = num(i.take_profit_sell_pct, 1, 100, "take_profit_sell_pct") ?? 50, tr = num(i.trailing_pct, 1, 90, "trailing_pct");
  if (sl == null && tp == null && tr == null) throw new AgentWalletError("Give at least one of stop_loss_pct, take_profit_x or trailing_pct");
  const bal = await tokenBalance(w.sol_address, i.mint).catch(() => ({ raw: 0n, decimals: 0 }));
  if (bal.raw <= 0n) throw new AgentWalletError("Your wallet does not hold this token: buy it first, then set the exit rules");
  const px = await bestPair(i.mint);
  if (!px) throw new AgentWalletError("Price not available for this token, so it cannot be watched");
  const d = await db();
  const { count } = await d.from("agent_exit_rules").select("id", { count: "exact", head: true }).eq("wallet_id", w.id).eq("status", "active");
  const { data: old } = await d.from("agent_exit_rules").select("id").eq("wallet_id", w.id).eq("mint", i.mint).eq("status", "active");
  if ((count ?? 0) - (old?.length ?? 0) >= MAX_RULES_PER_WALLET) throw new AgentWalletError(`At most ${MAX_RULES_PER_WALLET} tokens can be watched at the same time`);
  if (old?.length) await d.from("agent_exit_rules").update({ status: "cancelled", close_reason: "replaced", closed_at: new Date().toISOString() }).in("id", old.map((x: { id: string }) => x.id));
  const { data, error } = await d.from("agent_exit_rules").insert({
    wallet_id: w.id, mint: i.mint, symbol: i.symbol?.slice(0, 16) ?? null, entry_price: px.price, peak_price: px.price,
    sl_pct: sl, tp_x: tp, tp_sell_pct: tps, trail_pct: tr,
  }).select("*").single();
  if (error) throw new AgentWalletError("Could not save the exit rules");
  return data as ExitRule;
}

export async function listExits(w: AgentWallet, all = false): Promise<ExitRule[]> {
  const d = await db();
  let q = d.from("agent_exit_rules").select("*").eq("wallet_id", w.id).order("created_at", { ascending: false }).limit(30);
  if (!all) q = q.eq("status", "active");
  return ((await q).data ?? []) as ExitRule[];
}

export async function cancelExit(w: AgentWallet, id: string): Promise<void> {
  const d = await db();
  const { data } = await d.from("agent_exit_rules").update({ status: "cancelled", close_reason: "cancelled", closed_at: new Date().toISOString() }).eq("id", id).eq("wallet_id", w.id).eq("status", "active").select("id");
  if (!data?.length) throw new AgentWalletError("No active exit rule with this id");
}

type Dex = { baseToken?: { address?: string }; priceUsd?: string; liquidity?: { usd?: number } };
/** Prix des tokens (DexScreener, 30 par appel), pool la plus liquide */
async function prices(mints: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < mints.length; i += 30) {
    try {
      const r = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${mints.slice(i, i + 30).join(",")}`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
      const best = new Map<string, Dex>();
      for (const p of (r.ok ? await r.json() : []) as Dex[]) {
        const a = p.baseToken?.address; if (!a) continue;
        if ((p.liquidity?.usd ?? 0) > (best.get(a)?.liquidity?.usd ?? -1)) best.set(a, p);
      }
      for (const [a, p] of best) { const v = Number(p.priceUsd); if (v > 0) out.set(a, v); }
    } catch { /* prochain passage */ }
  }
  return out;
}

const CLAIM_MS = 120_000;

/** Cron : surveille les règles actives et vend quand un seuil est franchi (deux contrôles de suite). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runAgentExits(d: any, deadline: number): Promise<{ checked: number; sold: number; failed: number }> {
  const { data } = await d.from("agent_exit_rules").select("*").eq("status", "active").limit(300);
  const rules = (data ?? []) as ExitRule[];
  if (!rules.length) return { checked: 0, sold: 0, failed: 0 };
  const px = await prices([...new Set(rules.map((r) => r.mint))]);
  let sold = 0, failed = 0;
  for (const r of rules) {
    if (Date.now() > deadline) break;
    const price = px.get(r.mint);
    if (!price) continue;
    const { peak, action } = evaluateExit(r, price);
    const hits = action ? r.trigger_hits + 1 : 0;
    if (peak !== Number(r.peak_price) || hits !== r.trigger_hits) await d.from("agent_exit_rules").update({ peak_price: peak, trigger_hits: hits }).eq("id", r.id);
    if (!action || hits < CONFIRM_HITS) continue;
    // Réservation : un seul passage du cron vend (et pas de nouvel essai avant 2 minutes)
    const since = new Date(Date.now() - CLAIM_MS).toISOString();
    const { data: claim } = await d.from("agent_exit_rules").update({ last_attempt_at: new Date().toISOString() }).eq("id", r.id).eq("status", "active").or(`last_attempt_at.is.null,last_attempt_at.lt.${since}`).select("id");
    if (!claim?.length) continue;
    try {
      const { data: w } = await d.from("agent_wallets").select("*").eq("id", r.wallet_id).maybeSingle();
      if (!w) throw new AgentWalletError("Wallet not found");
      const bal = await tokenBalance(w.sol_address, r.mint);
      if (bal.raw <= 0n) {
        await d.from("agent_exit_rules").update({ status: "done", close_reason: "position already closed", closed_at: new Date().toISOString() }).eq("id", r.id);
        continue;
      }
      const raw = action.sellPct >= 100 ? bal.raw : (bal.raw * BigInt(Math.round(action.sellPct * 100))) / 10_000n;
      if (raw <= 0n) throw new AgentWalletError("Amount too small to sell");
      await aiSwap(w as AgentWallet, { mint: r.mint, side: "sell", amount: Number(raw) / 10 ** bal.decimals, rawAmount: raw, slippage_bps: 1500, reason: `Janus ${action.kind.replace("_", " ")}` });
      sold++;
      const now = new Date().toISOString();
      if (action.kind === "take_profit") {
        // Le reste de la position reste protégé s'il y a encore un stop loss ou une protection des gains
        const rest = r.sl_pct != null || r.trail_pct != null;
        await d.from("agent_exit_rules").update(rest ? { tp_done: true, trigger_hits: 0, last_attempt_at: null } : { tp_done: true, status: "done", close_reason: "take profit", closed_at: now }).eq("id", r.id);
      } else {
        await d.from("agent_exit_rules").update({ status: "done", close_reason: action.kind.replace("_", " "), closed_at: now }).eq("id", r.id);
      }
    } catch (e) {
      failed++;
      const fails = r.fail_count + 1;
      await d.from("agent_exit_rules").update({ fail_count: fails, last_error: (e instanceof Error ? e.message : "failed").slice(0, 300), ...(fails >= MAX_FAILS ? { status: "failed", close_reason: "too many failures", closed_at: new Date().toISOString() } : {}) }).eq("id", r.id);
    }
  }
  return { checked: rules.length, sold, failed };
}
