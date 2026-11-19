/**
 * Alertes rug (Solana) : pour les tokens que les utilisateurs détiennent (achetés par le Terminal OM, pas tout revendus),
 * on surveille la liquidité, les ventes du dev et le signalement « rugged » de RugCheck, et on notifie les détenteurs.
 * Appelé par le cron des alertes du Terminal (chaque minute) ; chaque token est relu au plus toutes les 5 minutes.
 */
import { analyzeDev } from "@/lib/terminal-dev";
import { tokenSecurity } from "@/lib/terminal-security";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
const QUOTES = new Set(["So11111111111111111111111111111111111111112", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"]);
/** Liquidité retombée sous 40 % de son plus haut (et ce plus haut d'au moins 2 000 $) */
const LIQ_DROP = 0.4, LIQ_MIN = 2_000;
const RECHECK_MS = 5 * 60_000, DEV_RECHECK_MS = 15 * 60_000, MAX_DEV_PER_RUN = 8;

type Liq = { liquidity: number | null; symbol: string | null };
async function liquidity(mints: string[]): Promise<Map<string, Liq>> {
  const out = new Map<string, Liq>();
  for (let i = 0; i < mints.length; i += 30) {
    try {
      const r = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${mints.slice(i, i + 30).join(",")}`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
      const pairs = (r.ok ? await r.json() : []) as { baseToken?: { address?: string; symbol?: string }; liquidity?: { usd?: number } }[];
      for (const p of pairs) {
        const a = p.baseToken?.address; if (!a) continue;
        const cur = out.get(a);
        out.set(a, { liquidity: (cur?.liquidity ?? 0) + (p.liquidity?.usd ?? 0), symbol: p.baseToken?.symbol ?? cur?.symbol ?? null });
      }
    } catch { /* prochaine minute */ }
  }
  return out;
}

/** Détenteurs par token : achats moins ventes faits par le Terminal OM sur 30 jours. */
async function holders(db: Db): Promise<Map<string, string[]>> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data } = await db.from("swaps").select("wallet, traded_mint, side, in_amount, out_amount").eq("chain", "solana").gte("created_at", since).limit(10_000);
  const net = new Map<string, bigint>();
  for (const s of (data ?? []) as { wallet: string; traded_mint: string; side: string; in_amount: string; out_amount: string }[]) {
    if (!s.traded_mint || QUOTES.has(s.traded_mint)) continue;
    const k = `${s.wallet}|${s.traded_mint}`;
    let v = 0n;
    try { v = BigInt(s.side === "buy" ? s.out_amount : s.in_amount); } catch { continue; }
    net.set(k, (net.get(k) ?? 0n) + (s.side === "buy" ? v : -v));
  }
  const by = new Map<string, string[]>();
  for (const [k, v] of net) {
    if (v <= 0n) continue;
    const [wallet, mint] = k.split("|");
    by.set(mint, [...(by.get(mint) ?? []), wallet]);
  }
  return by;
}

async function notify(db: Db, wallets: string[], mint: string, ref: string, data: Record<string, unknown>): Promise<number> {
  let n = 0;
  for (const wallet of wallets) {
    // Index unique (wallet, kind, actor, ref) : une alerte n'est envoyée qu'une fois
    const { error } = await db.from("notifications").insert({ wallet, kind: "rug_alert", actor: mint, ref, data: { ...data, mint } });
    if (!error) n++;
  }
  return n;
}

export async function runRugAlerts(db: Db, deadline: number): Promise<number> {
  const by = await holders(db);
  if (!by.size) return 0;
  const mints = [...by.keys()];
  const { data: rows } = await db.from("token_watch").select("mint, liquidity, peak_liquidity, dev_status, rugged, checked_at, dev_checked_at").in("mint", mints.slice(0, 1000));
  const state = new Map(((rows ?? []) as { mint: string; liquidity: number | null; peak_liquidity: number | null; dev_status: string | null; rugged: boolean; checked_at: string | null; dev_checked_at: string | null }[]).map((r) => [r.mint, r]));
  const now = Date.now();
  const due = mints.filter((m) => !state.get(m)?.checked_at || now - Date.parse(state.get(m)!.checked_at!) > RECHECK_MS).slice(0, 300);
  if (!due.length) return 0;
  const liq = await liquidity(due);
  const today = new Date().toISOString().slice(0, 10);
  let sent = 0, devRuns = 0;

  for (const mint of due) {
    if (Date.now() > deadline) break;
    const prev = state.get(mint);
    const cur = liq.get(mint);
    const holdersOf = by.get(mint)!;
    const symbol = cur?.symbol ?? null;
    const l = cur?.liquidity ?? null;
    const peak = Math.max(Number(prev?.peak_liquidity ?? 0), l ?? 0);
    const upd: Record<string, unknown> = { mint, symbol, liquidity: l, peak_liquidity: peak, checked_at: new Date().toISOString() };

    // 1. Liquidité retirée
    if (l != null && peak >= LIQ_MIN && l < peak * LIQ_DROP) {
      sent += await notify(db, holdersOf, mint, `${mint}:liq:${today}`, { reason: "liquidity", symbol, before: peak, now: l });
      upd.peak_liquidity = l; // nouveau point de départ
    }

    // 2. Ventes du dev (lecture plus lourde : quelques tokens par passage)
    const devDue = !prev?.dev_checked_at || now - Date.parse(prev.dev_checked_at) > DEV_RECHECK_MS;
    if (devDue && devRuns < MAX_DEV_PER_RUN) {
      devRuns++;
      const dev = await analyzeDev(mint).catch(() => null);
      if (dev && dev.status !== "unknown") {
        upd.dev_status = dev.status;
        upd.dev_checked_at = new Date().toISOString();
        const was = prev?.dev_status ?? null;
        // On ne prévient que d'un changement (pas au premier passage si le dev avait déjà vendu avant l'achat)
        if (was && was !== dev.status && (dev.status === "selling" || dev.status === "sold_all")) {
          sent += await notify(db, holdersOf, mint, `${mint}:dev:${dev.status}`, { reason: dev.status === "sold_all" ? "dev_sold_all" : "dev_selling", symbol, soldPct: dev.soldPct });
        }
      }
      // 3. Signalé « rugged » par RugCheck
      const sec = await tokenSecurity("solana", mint).catch(() => null);
      if (sec?.rugged && !prev?.rugged) {
        upd.rugged = true;
        sent += await notify(db, holdersOf, mint, `${mint}:rugged`, { reason: "rugged", symbol });
      }
    }
    await db.from("token_watch").upsert(upd, { onConflict: "mint" }).then(() => {}, () => {});
  }
  return sent;
}
