/**
 * GET /api/cron/update-token-stats
 *
 * Fetches market stats (price, market cap, 24h volume) from GeckoTerminal
 * for all active launchpad tokens and writes them to DB.
 *
 * Call every 5 minutes from your cron provider:
 *   curl -H "Authorization: Bearer <CRON_SECRET>" https://omdot.fun/api/cron/update-token-stats
 *
 * Rate limit: GeckoTerminal free tier allows ~30 req/min.
 * We process tokens in batches of 5 with 1s between batches.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const DS_BASE = "https://api.dexscreener.com/latest/dex/tokens";
const GT_BASE = "https://api.geckoterminal.com/api/v2/networks/solana/tokens";

type TokenStats = { priceUsd: number | null; marketCap: number | null; volume24h: number | null };

/** DexScreener — primary source, indexes Meteora DBC pools */
async function fetchDexStats(mint: string): Promise<TokenStats | null> {
  try {
    const res = await fetch(`${DS_BASE}/${mint}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json() as any;
    const pair = json?.pairs?.[0];
    if (!pair) return null;
    return {
      priceUsd:  pair.priceUsd   != null ? parseFloat(pair.priceUsd)   : null,
      marketCap: pair.marketCap  != null ? parseFloat(pair.marketCap)  : null,
      volume24h: pair.volume?.h24 != null ? parseFloat(pair.volume.h24) : null,
    };
  } catch {
    return null;
  }
}

/** GeckoTerminal — fallback for graduated pools */
async function fetchGeckoStats(mint: string): Promise<TokenStats | null> {
  try {
    const res = await fetch(`${GT_BASE}/${mint}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json() as any;
    const a = json?.data?.attributes;
    if (!a) return null;
    return {
      priceUsd:  a.price_usd       != null ? parseFloat(a.price_usd)       : null,
      marketCap: a.market_cap_usd  != null ? parseFloat(a.market_cap_usd)  : null,
      volume24h: a.volume_usd?.h24 != null ? parseFloat(a.volume_usd.h24)  : null,
    };
  } catch {
    return null;
  }
}

async function fetchStats(mint: string): Promise<TokenStats | null> {
  const ds = await fetchDexStats(mint);
  // Use DexScreener data if we got ANY field from it (price, MC, or volume)
  if (ds && (ds.priceUsd !== null || ds.marketCap !== null || ds.volume24h !== null)) return ds;
  return fetchGeckoStats(mint);
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    // Get all active tokens with a mint address (so GeckoTerminal can find them)
    const { data: tokens, error } = await admin
      .from("launchpad_tokens")
      .select("id, mint_address, volume_total_usd, volume_24h_snapshot_usd")
      .not("status", "in", "(pending,cancelled)")
      .not("mint_address", "is", null)
      .limit(200);

    if (error || !tokens || tokens.length === 0) {
      return NextResponse.json({ updated: 0, message: "No tokens to update" });
    }

    const BATCH = 5;
    let updated = 0;
    let skipped = 0;

    for (let i = 0; i < tokens.length; i += BATCH) {
      const batch = tokens.slice(i, i + BATCH) as {
        id: string;
        mint_address: string;
        volume_total_usd: number | null;
        volume_24h_snapshot_usd: number | null;
      }[];

      await Promise.all(
        batch.map(async (t) => {
          const stats = await fetchStats(t.mint_address);
          if (!stats) {
            skipped++;
            // Still stamp stats_updated_at so we know the token was attempted
            await admin
              .from("launchpad_tokens")
              .update({ stats_updated_at: new Date().toISOString() })
              .eq("id", t.id);
            return;
          }

          // Accumulate cumulative volume: add the positive delta vs last snapshot
          const newVol24h     = stats.volume24h ?? 0;
          const prevSnapshot  = t.volume_24h_snapshot_usd ?? 0;
          const prevTotal     = t.volume_total_usd ?? 0;
          const delta         = Math.max(0, newVol24h - prevSnapshot);
          const newTotal      = prevTotal + delta;

          const { error: upErr } = await admin
            .from("launchpad_tokens")
            .update({
              price_usd:               stats.priceUsd,
              market_cap_usd:          stats.marketCap,
              volume_24h_usd:          stats.volume24h,
              volume_total_usd:        newTotal,
              volume_24h_snapshot_usd: stats.volume24h ?? prevSnapshot,
              stats_updated_at:        new Date().toISOString(),
            })
            .eq("id", t.id);

          if (upErr) {
            console.warn("[update-token-stats] update failed for", t.id, upErr.message);
          } else {
            updated++;
          }
        }),
      );

      // 1s between batches to respect GeckoTerminal rate limit (~30 req/min)
      if (i + BATCH < tokens.length) await sleep(1000);
    }

    console.log(`[update-token-stats] updated=${updated} skipped=${skipped} total=${tokens.length}`);
    return NextResponse.json({ updated, skipped, total: tokens.length });
  } catch (err) {
    console.error("[update-token-stats] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
