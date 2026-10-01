/**
 * GET /api/v1/creators/{address}/tokens
 *
 * Solana: returns { mint, name, symbol, image, created_at, earned, claimed, claimable }
 *         claimable = Meteora DBC creatorQuoteFee in SOL
 * Arc:    same shape, claimable = BondingCurveArcV2.creatorAccrued() in USDC
 */

import { Connection, PublicKey }  from "@solana/web3.js";
import { createAdminClient }       from "@/lib/supabase/server";
import {
  detectAddrType, json, err, corsOk, checkRateLimit, getIp,
  readUint256, SEL_CREATOR_ACCRUED, weiToDecStr, lamportsToSol,
} from "@/lib/v1/helpers";

export async function OPTIONS() { return corsOk(); }

function getSolanaConnection() {
  return new Connection(process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com", "confirmed");
}

export async function GET(
  req: Request,
  { params }: { params: { address: string } },
) {
  if (!checkRateLimit(getIp(req))) return err("Too Many Requests", 429);

  const raw      = params.address;
  const addrType = detectAddrType(raw);
  if (addrType === "invalid") return err("Invalid address", 400);
  const address = addrType === "evm" ? raw.toLowerCase() : raw;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // ── Solana ────────────────────────────────────────────────────────────────
  if (addrType === "solana") {
    const { data: tokenRows } = await admin
      .from("launchpad_tokens")
      .select("id, name, ticker, logo_url, mint_address, pool_address, created_at")
      .eq("creator_wallet", address)
      .or("chain.eq.solana,chain.is.null")
      .in("status", ["active", "graduating", "graduated"])
      .order("created_at", { ascending: false });

    const tokens = (tokenRows ?? []) as {
      id: string; name: string; ticker: string; logo_url: string | null;
      mint_address: string | null; pool_address: string | null; created_at: string;
    }[];

    if (tokens.length === 0) return json([]);

    // claimed per token from DB
    const { data: claimRows } = await admin
      .from("creator_fee_claims")
      .select("token_id, amount_sol")
      .or("chain.eq.solana,chain.is.null")
      .eq("wallet", address)
      .in("token_id", tokens.map(t => t.id));

    const claimedByToken: Record<string, number> = {};
    for (const r of (claimRows ?? []) as { token_id: string; amount_sol: string | null }[]) {
      claimedByToken[r.token_id] = (claimedByToken[r.token_id] ?? 0) + parseFloat(r.amount_sol ?? "0");
    }

    // claimable per pool on-chain
    let dbcClient: unknown = null;
    try {
      const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const DBC = (sdk as any).DynamicBondingCurveClient;
      dbcClient = new DBC(getSolanaConnection(), "confirmed");
    } catch { /* RPC unavailable */ }

    const claimablePerToken = await Promise.all(
      tokens.map(async (t) => {
        if (!t.pool_address || !dbcClient) return 0;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const state = await (dbcClient as any).state.getPool(new PublicKey(t.pool_address));
          const inner = state?.poolState ?? state;
          const rawQ  = inner?.creatorQuoteFee;
          if (!rawQ) return 0;
          const lam = typeof rawQ === "object" && rawQ?.toNumber
            ? rawQ.toNumber()
            : typeof rawQ === "number" ? rawQ : parseInt(String(rawQ), 10);
          return isNaN(lam) ? 0 : lam;
        } catch { return 0; }
      }),
    );

    return json(tokens.map((t, i) => {
      const claimableLam = claimablePerToken[i];
      const claimableSol = claimableLam / 1e9;
      const claimedSol   = claimedByToken[t.id] ?? 0;
      return {
        mint:       t.mint_address,
        pool:       t.pool_address,
        name:       t.name,
        symbol:     t.ticker,
        image:      t.logo_url,
        created_at: t.created_at,
        currency:   "SOL",
        earned:     (claimedSol + claimableSol).toFixed(9).replace(/\.?0+$/, "") || "0",
        claimed:    claimedSol.toFixed(9).replace(/\.?0+$/, "") || "0",
        claimable:  lamportsToSol(claimableLam),
      };
    }));
  }

  // ── Arc ───────────────────────────────────────────────────────────────────
  const { data: tokenRows } = await admin
    .from("launchpad_tokens")
    .select("id, name, ticker, logo_url, arc_launch_id, mint_address, created_at")
    .ilike("creator_wallet", address)
    .eq("chain", "arc")
    .in("status", ["active", "graduating", "graduated"])
    .order("created_at", { ascending: false });

  const arcTokens = (tokenRows ?? []) as {
    id: string; name: string; ticker: string; logo_url: string | null;
    arc_launch_id: string | null; mint_address: string | null; created_at: string;
  }[];

  if (arcTokens.length === 0) return json([]);

  const { data: claimRows } = await admin
    .from("creator_fee_claims")
    .select("token_id, amount_usdc")
    .eq("chain", "arc")
    .ilike("wallet", address)
    .in("token_id", arcTokens.map(t => t.id));

  const claimedByToken: Record<string, number> = {};
  for (const r of (claimRows ?? []) as { token_id: string; amount_usdc: string | null }[]) {
    claimedByToken[r.token_id] = (claimedByToken[r.token_id] ?? 0) + parseFloat(r.amount_usdc ?? "0");
  }

  const accruals = await Promise.all(
    arcTokens.map(t => {
      const curve = t.arc_launch_id;
      if (!curve?.startsWith("0x") || curve.length !== 42) return Promise.resolve(0n);
      if (t.mint_address && curve.toLowerCase() === t.mint_address.toLowerCase()) return Promise.resolve(0n);
      return readUint256(curve, SEL_CREATOR_ACCRUED).catch(() => 0n);
    }),
  );

  return json(arcTokens.map((t, i) => {
    const claimableBig  = accruals[i];
    const claimableUsdc = Number(claimableBig) / 1e18;
    const claimedUsdc   = claimedByToken[t.id] ?? 0;
    return {
      mint:          t.mint_address,
      curve_address: t.arc_launch_id,
      name:          t.name,
      symbol:        t.ticker,
      image:         t.logo_url,
      created_at:    t.created_at,
      currency:      "USDC",
      earned:        (claimedUsdc + claimableUsdc).toFixed(6),
      claimed:       claimedUsdc.toFixed(6),
      claimable:     weiToDecStr(claimableBig),
    };
  }));
}

export const dynamic = "force-dynamic";
