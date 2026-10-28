/**
 * Mise à jour des stats des tokens Arc (prix, market cap, volume 24 h) dans launchpad_tokens.
 * Utilisée par le cron /api/cron/update-arc-stats ET, en rafraîchissement paresseux,
 * par /api/launchpad/trending (au cas où aucun cron externe ne tourne).
 */
import { createPublicClient, http } from "viem";
import { arc } from "@/lib/arc-chain";
import { BONDING_CURVE_V2_ABI, resolveArcPoolFee } from "@/lib/arc-launchpad";
import { createAdminClient } from "@/lib/supabase/server";
import { directPoolFee, readPoolPrice } from "@/lib/arc-trades";


const TOTAL_SUPPLY = 1_000_000_000;
const TIMEOUT_MS   = 8_000;

function withTimeout<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T | null> {
  return Promise.race([p, new Promise<null>(r => setTimeout(() => r(null), ms))]);
}

async function getReservesV2(
  client: ReturnType<typeof createPublicClient>,
  curve: `0x${string}`,
): Promise<{ priceUsd: number; marketCap: number } | null> {
  try {
    const [usdcRaw, tokRaw] = await Promise.all([
      client.readContract({ address: curve, abi: BONDING_CURVE_V2_ABI, functionName: "reserveUsdc" }),
      client.readContract({ address: curve, abi: BONDING_CURVE_V2_ABI, functionName: "reserveTokens" }),
    ]);
    const tok = tokRaw as bigint;
    const usd = usdcRaw as bigint;
    if (tok === 0n) return null;
    const reserveUsdc   = Number(usd) / 1e18; // USDC natif Arc 18 dec
    const reserveTokens = Number(tok) / 1e18;
    const priceUsd  = reserveUsdc / reserveTokens;
    const marketCap = priceUsd * TOTAL_SUPPLY;
    return { priceUsd, marketCap };
  } catch {
    return null;
  }
}

async function getVolume24h(curveAddress: string, origin: string): Promise<number | null> {
  try {
    const res = await fetch(
      `${origin}/api/launchpad/arc-trades?curveAddress=${curveAddress}&limit=1000`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    const json = await res.json() as { trades?: { timestamp: number; usdcAmt: number }[] };
    if (!json.trades?.length) return 0;
    const since = Date.now() / 1000 - 86_400;
    return json.trades.filter(t => t.timestamp >= since).reduce((s, t) => s + t.usdcAmt, 0);
  } catch {
    return null;
  }
}


export async function refreshArcStats(origin: string): Promise<{ updated: number; failed: number; total: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: tokens, error } = await admin
    .from("launchpad_tokens")
    .select("id, arc_launch_id, mint_address, status")
    .eq("chain", "arc")
    .in("status", ["active", "graduating", "graduated"])
    .not("arc_launch_id", "is", null);

  if (error) throw error;
  if (!tokens?.length) return { updated: 0, failed: 0, total: 0 };

  const client = createPublicClient({ chain: arc, transport: http("https://rpc.mainnet.arc.io") });

  type TokenRow = { id: string; arc_launch_id: string; mint_address: string | null; status: string };

  const results = await Promise.allSettled(
    (tokens as TokenRow[]).map(async (t) => {
      const curveAddr = t.arc_launch_id as `0x${string}`;
      // Pool Uniswap V4 : lancement direct, ou token gradué (la courbe ne bouge plus) — le prix vient du pool
      const mint = t.mint_address && /^0x[0-9a-fA-F]{40}$/.test(t.mint_address) ? t.mint_address : null;
      const dFee = mint ? await directPoolFee(t.arc_launch_id.toLowerCase()) : null;
      const poolFee = dFee ?? (mint && t.status === "graduated" ? await resolveArcPoolFee(client, t.arc_launch_id, true) : null);
      const poolPrice = mint && poolFee !== null ? await withTimeout(readPoolPrice(mint, poolFee)) : null;
      const [curveReserves, volume24h] = await Promise.all([
        dFee !== null ? Promise.resolve(null) : withTimeout(getReservesV2(client, curveAddr)),
        withTimeout(getVolume24h(t.arc_launch_id, origin)),
      ]);
      const reserves = poolPrice ? { priceUsd: poolPrice, marketCap: poolPrice * TOTAL_SUPPLY } : curveReserves;
      if (!reserves) return { skipped: true };
      const { error: upErr } = await admin
        .from("launchpad_tokens")
        .update({
          price_usd:      reserves.priceUsd,
          market_cap_usd: reserves.marketCap,
          volume_24h_usd: volume24h ?? 0,
        })
        .eq("id", t.id);
      if (upErr) throw upErr;
      return { skipped: false };
    }),
  );

  const updated = results.filter(r => r.status === "fulfilled" && !(r.value as { skipped?: boolean }).skipped).length;
  const failed  = results.filter(r => r.status === "rejected").length;
  return { updated, failed, total: tokens.length };
}

// ── Rafraîchissement paresseux (au plus toutes les 5 min, en arrière-plan) ──────
let lastRefresh = 0;
let refreshing = false;
export function maybeRefreshArcStats(origin: string, everyMs = 5 * 60_000): void {
  if (refreshing || Date.now() - lastRefresh < everyMs) return;
  refreshing = true;
  lastRefresh = Date.now();
  refreshArcStats(origin)
    .catch((e) => console.error("[arc-stats] lazy refresh failed:", e))
    .finally(() => { refreshing = false; });
}
