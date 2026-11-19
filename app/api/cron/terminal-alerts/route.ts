/**
 * GET /api/cron/terminal-alerts : à appeler chaque minute.
 * 1. Alertes de capitalisation : déclenche celles dont le seuil est franchi (prix DexScreener) et envoie une notification.
 * 2. Wallets suivis (Solana) : relit leurs nouvelles transactions et notifie chaque achat ou vente de token.
 * 4. Pools automatiques des tokens (lib/market/token-pools) : résolution Oui / Non et palier suivant.
 * 3. Alertes rug : liquidité retirée, dev qui vend, token signalé « rugged », pour les tokens détenus (lib/rug-alerts).
 */
import { NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron";
import { createAdminClient } from "@/lib/supabase/server";
import { solanaConnection } from "@/lib/solana/rpc";
import { PublicKey } from "@solana/web3.js";
import { runRugAlerts } from "@/lib/rug-alerts";
import { runTokenPools, seedOmTokenPools } from "@/lib/market/token-pools";
import { sweepIdleWallets } from "@/lib/agent-wallet/idle";
import { runAgentExits } from "@/lib/agent-wallet/exits";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DS_CHAIN: Record<string, string> = { solana: "solana", base: "base", bnb: "bsc", ethereum: "ethereum", arbitrum: "arbitrum", polygon: "polygon", avalanche: "avalanche", hyperliquid: "hyperevm" };
// Ni SOL enveloppé ni stablecoins : ce ne sont pas des « trades » de token
const QUOTES = new Set(["So11111111111111111111111111111111111111112", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"]);

type DsPair = { baseToken?: { address?: string; symbol?: string }; marketCap?: number; fdv?: number; liquidity?: { usd?: number }; priceUsd?: string };

/** Capitalisation et symbole de plusieurs tokens d'un réseau (30 par appel). */
async function market(chain: string, mints: string[]): Promise<Map<string, { mcap: number | null; symbol: string | null; price: number | null }>> {
  const out = new Map<string, { mcap: number | null; symbol: string | null; price: number | null }>();
  for (let i = 0; i < mints.length; i += 30) {
    try {
      const r = await fetch(`https://api.dexscreener.com/tokens/v1/${DS_CHAIN[chain] ?? chain}/${mints.slice(i, i + 30).join(",")}`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
      const pairs = (r.ok ? await r.json() : []) as DsPair[];
      // Pour chaque token, la paire la plus liquide
      const best = new Map<string, DsPair>();
      for (const p of pairs) {
        const a = p.baseToken?.address; if (!a) continue;
        const k = chain === "solana" ? a : a.toLowerCase();
        if ((p.liquidity?.usd ?? 0) > (best.get(k)?.liquidity?.usd ?? -1)) best.set(k, p);
      }
      for (const [k, p] of best) out.set(k, { mcap: p.marketCap ?? p.fdv ?? null, symbol: p.baseToken?.symbol ?? null, price: Number(p.priceUsd) || null });
    } catch { /* on réessaiera à la prochaine minute */ }
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runAlerts(db: any): Promise<number> {
  const { data } = await db.from("terminal_alerts").select("id, wallet, chain, mint, symbol, kind, value").is("triggered_at", null).limit(2000);
  const alerts = (data ?? []) as { id: string; wallet: string; chain: string; mint: string; symbol: string | null; kind: string; value: number }[];
  if (!alerts.length) return 0;
  const byChain = new Map<string, Set<string>>();
  for (const a of alerts) byChain.set(a.chain, (byChain.get(a.chain) ?? new Set()).add(a.mint));
  const prices = new Map<string, { mcap: number | null; symbol: string | null }>();
  for (const [chain, set] of byChain) for (const [k, v] of await market(chain, [...set])) prices.set(`${chain}:${k}`, v);
  let fired = 0;
  for (const a of alerts) {
    const m = prices.get(`${a.chain}:${a.chain === "solana" ? a.mint : a.mint.toLowerCase()}`);
    if (m?.mcap == null) continue;
    const hit = a.kind === "mcap_above" ? m.mcap >= Number(a.value) : m.mcap <= Number(a.value);
    if (!hit) continue;
    // Verrou : une seule notification même si deux appels du cron se chevauchent
    const { data: won } = await db.from("terminal_alerts").update({ triggered_at: new Date().toISOString() }).eq("id", a.id).is("triggered_at", null).select("id");
    if (!won?.length) continue;
    await db.from("notifications").insert({
      wallet: a.wallet, kind: "price_alert", actor: a.mint, ref: a.id,
      data: { chain: a.chain, symbol: a.symbol ?? m.symbol, mcap: m.mcap, value: Number(a.value), kind: a.kind },
    }).then(() => {}, () => {});
    fired++;
  }
  return fired;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runTracked(db: any, deadline: number): Promise<number> {
  const { data } = await db.from("tracked_wallets").select("id, owner, address, label, last_sig").order("last_checked_at", { ascending: true, nullsFirst: true }).limit(60);
  const rows = (data ?? []) as { id: string; owner: string; address: string; label: string | null; last_sig: string | null }[];
  const conn = solanaConnection();
  let sent = 0;
  // Plusieurs propriétaires peuvent suivre la même adresse : on ne la relit qu'une fois
  const byAddr = new Map<string, typeof rows>();
  for (const r of rows) byAddr.set(r.address, [...(byAddr.get(r.address) ?? []), r]);
  for (const [address, owners] of byAddr) {
    if (Date.now() > deadline) break;
    const now = new Date().toISOString();
    try {
      const until = owners.map((o) => o.last_sig).find(Boolean) ?? undefined;
      const sigs = (await conn.getSignaturesForAddress(new PublicKey(address), { limit: 10, until }, "confirmed")).filter((s) => !s.err);
      const newest = sigs[0]?.signature ?? until ?? null;
      // Premier passage : on part de maintenant, sans notifier l'historique
      const fresh = until ? sigs.slice(0, 5).reverse() : [];
      const events: { sig: string; mint: string; side: "buy" | "sell"; amount: number }[] = [];
      for (const s of fresh) {
        const tx = await conn.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }).catch(() => null);
        if (!tx?.meta) continue;
        const delta = new Map<string, number>();
        for (const b of tx.meta.preTokenBalances ?? []) if (b.owner === address) delta.set(b.mint, (delta.get(b.mint) ?? 0) - Number(b.uiTokenAmount.uiAmount ?? 0));
        for (const b of tx.meta.postTokenBalances ?? []) if (b.owner === address) delta.set(b.mint, (delta.get(b.mint) ?? 0) + Number(b.uiTokenAmount.uiAmount ?? 0));
        for (const [mint, d] of delta) if (!QUOTES.has(mint) && Math.abs(d) > 0) events.push({ sig: s.signature, mint, side: d > 0 ? "buy" : "sell", amount: Math.abs(d) });
      }
      const info = events.length ? await market("solana", [...new Set(events.map((e) => e.mint))]) : new Map();
      for (const e of events) {
        const m = info.get(e.mint);
        for (const o of owners) {
          await db.from("notifications").insert({
            wallet: o.owner, kind: "wallet_trade", actor: address, ref: `${e.sig}:${e.mint}`,
            data: { label: o.label, side: e.side, mint: e.mint, symbol: m?.symbol ?? null, amount: e.amount, usd: m?.price ? e.amount * m.price : null },
          }).then(() => {}, () => {});
          sent++;
        }
      }
      await db.from("tracked_wallets").update({ last_sig: newest, last_checked_at: now }).eq("address", address);
    } catch {
      await db.from("tracked_wallets").update({ last_checked_at: now }).eq("address", address);
    }
  }
  return sent;
}

export async function GET(req: Request) {
  const denied = cronDenied(req);
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const deadline = Date.now() + 45_000;
  const [alerts, trades, rug, pools, exits] = await Promise.all([
    runAlerts(db).catch(() => -1), runTracked(db, deadline).catch(() => -1), runRugAlerts(db, deadline).catch(() => -1),
    runTokenPools(db, deadline).catch(() => null), runAgentExits(db, deadline).catch(() => null),
  ]);
  // Toutes les 10 minutes : pools automatiques pour les tokens OM qui n'en ont pas
  const seeded = new Date().getUTCMinutes() % 10 === 0 ? await seedOmTokenPools(db, deadline).catch(() => -1) : 0;
  // Une fois par jour (vers 03:00 UTC) : les wallets d'IA inactifs depuis 30 jours renvoient leurs fonds à leur humain
  const now = new Date();
  const idle = now.getUTCHours() === 3 && now.getUTCMinutes() < 2 ? await sweepIdleWallets(db, deadline).catch(() => null) : null;
  return NextResponse.json({ alerts, trades, rug, pools, seeded, idle, exits });
}
