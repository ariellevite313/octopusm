/**
 * GET /api/leaderboard
 *
 * Returns the top creator wallets ranked by fees claimed.
 * Solana creators earn SOL, Arc creators (0x… / MetaMask) earn USDC.
 * Ranking compares both in USD (SOL converted at the live SOL price).
 * Data comes from creator_fee_claims (confirmed on-chain claims only).
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const revalidate = 60;

export type LeaderboardEntry = {
  rank:         number;
  walletAddress: string;
  totalFeeSol:  number;
  /** Montant affiché, dans la devise du créateur (SOL ou USDC). */
  totalFee:     number;
  currency:     "SOL" | "USDC";
  tokenCount:   number;
  claimCount:   number;
  displayName:  string | null;
  avatarSrc:    string | null;
};

export type LeaderboardResponse = {
  entries: LeaderboardEntry[];
  updatedAt: string;
};

const PERIOD_HOURS: Record<string, number | null> = {
  "24h": 24,
  "7d":  24 * 7,
  "30d": 24 * 30,
  "1y":  24 * 365,
  "all": null,
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const periodKey = searchParams.get("period") ?? "all";
    const hours     = PERIOD_HOURS[periodKey] ?? null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    // Aggregate claims by wallet
    // Note: column names are `wallet` and `claimed_at` (not wallet_address / created_at)
    let claimsQuery = admin
      .from("creator_fee_claims")
      .select("wallet, amount_sol, amount_usdc, chain");

    if (hours !== null) {
      const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
      claimsQuery = claimsQuery.gte("claimed_at", since);
    }

    const { data: claims, error: claimsError } = await claimsQuery;

    if (claimsError) {
      return NextResponse.json({ error: claimsError.message }, { status: 500 });
    }

    // Count tokens per wallet (only active/graduating/graduated)
    const { data: tokens, error: tokensError } = await admin
      .from("launchpad_tokens")
      .select("creator_wallet")
      .in("status", ["active", "graduating", "graduated"]);

    if (tokensError) {
      return NextResponse.json({ error: tokensError.message }, { status: 500 });
    }

    // Aggregate in JS (SOL pour Solana, USDC pour Arc)
    const walletMap = new Map<string, { totalFeeSol: number; totalFeeUsdc: number; claimCount: number }>();

    for (const claim of (claims ?? []) as { wallet: string; amount_sol: number | string | null; amount_usdc: number | string | null; chain: string | null }[]) {
      const isArc = claim.chain === "arc" || claim.wallet?.startsWith("0x");
      const key = claim.wallet;
      const existing = walletMap.get(key) ?? { totalFeeSol: 0, totalFeeUsdc: 0, claimCount: 0 };
      walletMap.set(key, {
        totalFeeSol:  existing.totalFeeSol  + (isArc ? 0 : Number(claim.amount_sol ?? 0)),
        totalFeeUsdc: existing.totalFeeUsdc + (isArc ? Number(claim.amount_usdc ?? 0) : 0),
        claimCount:   existing.claimCount + 1,
      });
    }

    const solUsd = await getSolUsd();

    // Count tokens per wallet
    const tokenCountMap = new Map<string, number>();
    for (const t of (tokens ?? []) as { creator_wallet: string }[]) {
      const k = t.creator_wallet;
      tokenCountMap.set(k, (tokenCountMap.get(k) ?? 0) + 1);
    }

    // Build sorted entries — only wallets with at least one claim
    const sortedWallets = [...walletMap.entries()]
      .map(([wallet, { totalFeeSol, totalFeeUsdc, claimCount }]) => {
        const isArc = wallet.startsWith("0x");
        return {
          walletAddress: wallet,
          totalFeeSol:   Math.round(totalFeeSol * 1e6) / 1e6,
          totalFee:      Math.round((isArc ? totalFeeUsdc : totalFeeSol) * 1e6) / 1e6,
          currency:      (isArc ? "USDC" : "SOL") as "SOL" | "USDC",
          usdValue:      isArc ? totalFeeUsdc : totalFeeSol * solUsd,
          claimCount,
          tokenCount:    tokenCountMap.get(wallet) ?? 0,
        };
      })
      // Classement en USD ; sans prix SOL, les SOL passent devant puis les USDC
      .sort((a, b) => solUsd > 0 ? b.usdValue - a.usdValue : (b.totalFeeSol - a.totalFeeSol) || (b.totalFee - a.totalFee))
      .slice(0, 100)
      .map(({ usdValue: _usd, ...e }) => e);

    // Fetch profiles from wallets table
    const walletAddresses = sortedWallets.map(e => e.walletAddress);
    const { data: profiles } = walletAddresses.length > 0
      ? await admin
          .from("wallets")
          .select("address, display_name, username, twitter_handle, avatar_src")
          .in("address", walletAddresses)
      : { data: [] };

    const profileMap = new Map<string, { display_name: string | null; avatar_src: string | null }>();
    for (const p of (profiles ?? []) as { address: string; display_name: string | null; username: string | null; twitter_handle: string | null; avatar_src: string | null }[]) {
      const handle = p.twitter_handle ? `@${p.twitter_handle.replace(/^@/, "")}` : null;
      profileMap.set(p.address, { display_name: p.display_name || p.username || handle, avatar_src: p.avatar_src || null });
    }

    const entries: LeaderboardEntry[] = sortedWallets.map((entry, i) => {
      const profile = profileMap.get(entry.walletAddress);
      return {
        rank: i + 1,
        ...entry,
        displayName: profile?.display_name ?? null,
        avatarSrc:   profile?.avatar_src   ?? null,
      };
    });

    return NextResponse.json({
      entries,
      updatedAt: new Date().toISOString(),
    } satisfies LeaderboardResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Prix SOL en USD (Binance, puis CoinGecko). 0 si indisponible. */
async function getSolUsd(): Promise<number> {
  try {
    const r = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT", { next: { revalidate: 300 }, signal: AbortSignal.timeout(4000) });
    if (r.ok) { const d = await r.json() as { price?: string }; const v = Number(d.price); if (v > 0) return v; }
  } catch { /* fallback */ }
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", { next: { revalidate: 300 }, signal: AbortSignal.timeout(4000) });
    if (r.ok) { const d = await r.json() as { solana?: { usd?: number } }; const v = Number(d.solana?.usd); if (v > 0) return v; }
  } catch { /* ignore */ }
  return 0;
}
