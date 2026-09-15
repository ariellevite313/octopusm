/**
 * GET  /api/launchpad/[id]/claim-fees  — montant claimable
 * POST /api/launchpad/[id]/claim-fees  — exécuter le claim
 *
 * Arc tokens  : lit/appelle BondingCurve.claimFees(to) via viem (EVM)
 * Solana tokens : lit/appelle DBC SDK claimCreatorTradingFee
 */
import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { createPublicClient, http, encodeFunctionData } from "viem";
import BN from "bn.js";
import { createAdminClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

// ── ABI minimal BondingCurve Arc ──────────────────────────────────────────────
const BONDING_CURVE_ABI = [
  {
    name: "creatorFeesAccrued",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "claimFees",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }],
    outputs: [],
  },
] as const;

// ── Arc RPC client (server-side) ──────────────────────────────────────────────
const arcPublicClient = createPublicClient({
  transport: http("https://rpc.testnet.arc.network"),
});

// ── Solana helpers ────────────────────────────────────────────────────────────
function bnToNumber(raw: unknown): number {
  if (!raw) return 0;
  if (typeof raw === "number") return raw;
  if (typeof raw === "object" && raw !== null && "toNumber" in raw) {
    try { return (raw as BN).toNumber(); } catch { return Number(raw.toString()); }
  }
  return Number(String(raw));
}

function rawToBN(raw: unknown): BN {
  if (!raw) return new BN(0);
  if (raw instanceof BN) return raw;
  if (typeof raw === "number") return new BN(raw);
  if (typeof raw === "object" && raw !== null && "toNumber" in raw) return new BN((raw as BN).toNumber());
  const str = String(raw).trim();
  return str && str !== "0" ? new BN(str) : new BN(0);
}

function getSolanaConnection(): Connection {
  const rpc = process.env.SOLANA_RPC_URL;
  if (!rpc) throw new Error("SOLANA_RPC_URL is not set");
  return new Connection(rpc, "confirmed");
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — montant claimable
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data: token, error } = await admin
      .from("launchpad_tokens")
      .select("chain, arc_launch_id, pool_address, mint_address")
      .eq("id", id)
      .maybeSingle();

    if (error || !token) return NextResponse.json({ claimableSol: null });

    // ── Arc EVM ───────────────────────────────────────────────────────────────
    if (token.chain === "arc" && token.arc_launch_id) {
      try {
        const raw = await arcPublicClient.readContract({
          address:      token.arc_launch_id as `0x${string}`,
          abi:          BONDING_CURVE_ABI,
          functionName: "creatorFeesAccrued",
        });
        // USDC sur Arc : 6 décimales
        const claimableUsdc = Number(raw) / 1_000_000;
        return NextResponse.json({ claimableUsdc });
      } catch (e) {
        console.error("[claim-fees GET] Arc read error:", e);
        return NextResponse.json({ claimableUsdc: null });
      }
    }

    // ── Solana DBC ────────────────────────────────────────────────────────────
    const poolAddress = token.pool_address as string | null;
    const mintAddress = token.mint_address as string | null;

    if (!poolAddress && !mintAddress) return NextResponse.json({ claimableSol: null });

    // 1. DBC SDK — montant exact on-chain
    if (poolAddress) {
      try {
        const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const DynamicBondingCurveClient = (sdk as any).DynamicBondingCurveClient;
        const connection = getSolanaConnection();
        const client     = new DynamicBondingCurveClient(connection, "confirmed");
        const pool       = new PublicKey(poolAddress);
        const poolState  = await client.state.getPool(pool);
        if (poolState) {
          const inner  = poolState.poolState ?? poolState;
          const quoteL = bnToNumber(inner?.creatorQuoteFee);
          const baseL  = bnToNumber(inner?.creatorBaseFee);
          return NextResponse.json({ claimableSol: quoteL / 1e9, claimableBaseUnits: baseL });
        }
      } catch { /* fallthrough */ }
    }

    // 2. Fallback GeckoTerminal
    try {
      let gtPool = poolAddress;
      if (!gtPool && mintAddress) {
        const res = await fetch(
          `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mintAddress}/pools?page=1`,
          { headers: { Accept: "application/json" } }
        );
        if (res.ok) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const json = await res.json() as any;
          gtPool = json?.data?.[0]?.attributes?.address ?? null;
        }
      }
      if (gtPool) {
        const res = await fetch(
          `https://api.geckoterminal.com/api/v2/networks/solana/pools/${gtPool}`,
          { headers: { Accept: "application/json" } }
        );
        if (res.ok) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const json = await res.json() as any;
          const attrs = json?.data?.attributes;
          const volumeUsd24h = parseFloat(attrs?.volume_usd?.h24 ?? "0");
          let feePct = parseFloat(attrs?.pool_fee ?? attrs?.swap_fee ?? "0");
          if (feePct > 0 && feePct < 1) feePct = feePct * 100;
          const feesUsd24h = volumeUsd24h * (feePct / 100) * (1 / 2);
          if (feesUsd24h > 0) return NextResponse.json({ claimableSol: null, feesUsd24h: Number(feesUsd24h.toFixed(4)) });
        }
      }
    } catch { /* GeckoTerminal failed */ }

    return NextResponse.json({ claimableSol: null, feesUsd24h: null });

  } catch (err) {
    console.error("[claim-fees GET] error:", err);
    return NextResponse.json({ claimableSol: null, feesUsd24h: null });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — construire la transaction de claim
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
    const body = await req.json() as { walletAddress?: string };
    if (!body.walletAddress) {
      return NextResponse.json({ error: "walletAddress is required" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data: token, error } = await admin
      .from("launchpad_tokens")
      .select("id, chain, arc_launch_id, creator_wallet, status, pool_address, mint_address")
      .eq("id", id)
      .maybeSingle();

    if (error || !token) return NextResponse.json({ error: "Token not found" }, { status: 404 });
    if ((token.creator_wallet as string).toLowerCase() !== body.walletAddress.toLowerCase()) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // ── Arc EVM ───────────────────────────────────────────────────────────────
    if (token.chain === "arc") {
      if (!token.arc_launch_id) {
        return NextResponse.json({ error: "Curve address not found — token not yet launched" }, { status: 409 });
      }

      // Vérifier qu'il y a bien des fees à claim
      const raw = await arcPublicClient.readContract({
        address:      token.arc_launch_id as `0x${string}`,
        abi:          BONDING_CURVE_ABI,
        functionName: "creatorFeesAccrued",
      }).catch(() => 0n);

      if (raw === 0n) {
        return NextResponse.json({ error: "Nothing to claim — no fees accumulated yet" }, { status: 409 });
      }

      const claimableUsdc = Number(raw) / 1_000_000;

      // Retourner les infos pour que le frontend appelle directement via wagmi
      // (pas de tx côté serveur pour Arc — le créateur signe lui-même)
      const calldata = encodeFunctionData({
        abi:          BONDING_CURVE_ABI,
        functionName: "claimFees",
        args:         [body.walletAddress as `0x${string}`],
      });

      return NextResponse.json({
        chain:        "arc",
        curveAddress: token.arc_launch_id,
        calldata,
        claimableUsdc,
        abi:          BONDING_CURVE_ABI,
      });
    }

    // ── Solana DBC ────────────────────────────────────────────────────────────
    if (!token.pool_address) {
      return NextResponse.json({ error: "No pool address — token not yet launched" }, { status: 409 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let DynamicBondingCurveClient: any;
    try {
      const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
      DynamicBondingCurveClient = sdk.DynamicBondingCurveClient;
    } catch {
      return NextResponse.json({ error: "DBC SDK not installed" }, { status: 500 });
    }

    const connection = getSolanaConnection();
    const client     = new DynamicBondingCurveClient(connection, "confirmed");
    const creator    = new PublicKey(token.creator_wallet as string);
    const pool       = new PublicKey(token.pool_address as string);

    let claimableSol: number;
    let maxBaseAmount: BN;
    let maxQuoteAmount: BN;
    try {
      const poolState = await client.state.getPool(pool);
      if (!poolState) throw new Error("Pool not found");
      const inner = poolState.poolState ?? poolState;
      maxBaseAmount  = rawToBN(inner?.creatorBaseFee);
      maxQuoteAmount = rawToBN(inner?.creatorQuoteFee);
      if (maxBaseAmount.isZero() && maxQuoteAmount.isZero()) {
        return NextResponse.json({ error: "Nothing to claim — no fees accumulated in this pool yet" }, { status: 409 });
      }
      claimableSol = maxQuoteAmount.toNumber() / 1e9;
    } catch (e) {
      return NextResponse.json({ error: `Could not fetch pool state: ${e instanceof Error ? e.message : "Unknown"}` }, { status: 503 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let claimTx: any;
    try {
      claimTx = await client.creator.claimCreatorTradingFeeToReceiver({
        creator, pool, payer: creator, receiver: creator, maxBaseAmount, maxQuoteAmount,
      });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to build claim transaction" }, { status: 500 });
    }

    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    claimTx.recentBlockhash = blockhash;
    claimTx.feePayer = creator;

    return NextResponse.json({
      chain: "solana",
      transactionBase64: Buffer.from(claimTx.serialize({ requireAllSignatures: false })).toString("base64"),
      claimableSol,
    });

  } catch (err) {
    console.error("[claim-fees POST] error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
