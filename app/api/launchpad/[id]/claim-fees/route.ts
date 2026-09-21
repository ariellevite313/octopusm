/**
 * GET  /api/launchpad/[id]/claim-fees  — montant claimable
 * POST /api/launchpad/[id]/claim-fees  — calldata pour claim (signé côté client)
 *
 * Arc V2 tokens  : BondingCurveArcV2.creatorAccrued / claimCreatorFees(to)
 *                  Post-grad : GraduationVaultV4.collectFees() — 30% créateur
 * Solana tokens  : DBC SDK claimCreatorTradingFee
 *
 * USDC Arc = natif ETH 18 décimales (≠ USDC ERC-20 6 dec)
 */
import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { createPublicClient, http, encodeFunctionData } from "viem";
import BN from "bn.js";
import { createAdminClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

// ── ABI minimal BondingCurveArcV2 ─────────────────────────────────────────────
const BONDING_CURVE_V2_ABI = [
  {
    name: "creatorAccrued",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "graduated",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "claimCreatorFees",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }],
    outputs: [],
  },
] as const;

// ── ABI minimal GraduationVaultV4 (post-graduation) ───────────────────────────
const GRADUATION_VAULT_V4_ABI = [
  {
    // collectFees() : 30% créateur + 70% treasury — callable by anyone
    name: "collectFees",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
] as const;

// ── Arc RPC client (server-side) ──────────────────────────────────────────────
const arcPublicClient = createPublicClient({
  transport: http("https://rpc.mainnet.arc.io"),
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

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

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
      .select("chain, arc_launch_id, vault_address, pool_address, mint_address")
      .eq("id", id)
      .maybeSingle();

    if (error || !token) return NextResponse.json({ claimableSol: null });

    // ── Arc EVM V2 ────────────────────────────────────────────────────────────
    if (token.chain === "arc" && token.arc_launch_id) {
      try {
        const curveAddress = token.arc_launch_id as `0x${string}`;

        const isGraduated = await arcPublicClient.readContract({
          address:      curveAddress,
          abi:          BONDING_CURVE_V2_ABI,
          functionName: "graduated",
        }).catch(() => false);

        if (isGraduated) {
          // Post-graduation : solde ETH du GraduationVaultV4 = frais LP accumulés
          const vaultAddress = (token.vault_address ?? null) as `0x${string}` | null;
          if (!vaultAddress || vaultAddress === ZERO_ADDR) {
            return NextResponse.json({ claimableUsdc: 0, graduated: true });
          }
          const vaultBal = await arcPublicClient.getBalance({ address: vaultAddress });
          // natif Arc 18 dec → unité humaine
          const claimableUsdc = Number(vaultBal) / 1e18;
          return NextResponse.json({ claimableUsdc, graduated: true, vaultAddress });
        } else {
          // Pré-graduation : creatorAccrued sur BondingCurveArcV2 (18 dec)
          const raw = await arcPublicClient.readContract({
            address:      curveAddress,
            abi:          BONDING_CURVE_V2_ABI,
            functionName: "creatorAccrued",
          });
          const claimableUsdc = Number(raw) / 1e18;
          return NextResponse.json({ claimableUsdc, graduated: false });
        }
      } catch (e) {
        console.error("[claim-fees GET] Arc V2 read error:", e);
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
// POST — calldata pour claim (signé côté client)
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
      .select("id, chain, arc_launch_id, vault_address, creator_wallet, status, pool_address, mint_address")
      .eq("id", id)
      .maybeSingle();

    if (error || !token) return NextResponse.json({ error: "Token not found" }, { status: 404 });
    if ((token.creator_wallet as string).toLowerCase() !== body.walletAddress.toLowerCase()) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // ── Arc EVM V2 ────────────────────────────────────────────────────────────
    if (token.chain === "arc") {
      if (!token.arc_launch_id) {
        return NextResponse.json({ error: "Curve address not found — token not yet launched" }, { status: 409 });
      }

      const curveAddress = token.arc_launch_id as `0x${string}`;

      const isGraduated = await arcPublicClient.readContract({
        address:      curveAddress,
        abi:          BONDING_CURVE_V2_ABI,
        functionName: "graduated",
      }).catch(() => false);

      if (isGraduated) {
        // ── Post-graduation : collectFees() sur GraduationVaultV4 ─────────────
        const vaultAddress = (token.vault_address ?? null) as `0x${string}` | null;
        if (!vaultAddress || vaultAddress === ZERO_ADDR) {
          return NextResponse.json({ error: "Vault address not found for this token" }, { status: 409 });
        }

        const vaultBal = await arcPublicClient.getBalance({ address: vaultAddress }).catch(() => 0n);
        if (vaultBal === 0n) {
          return NextResponse.json({ error: "Nothing to collect — vault balance is zero" }, { status: 409 });
        }

        const claimableUsdc = Number(vaultBal) / 1e18;

        // collectFees() : 30% → creator, 70% → treasury (pas d'argument)
        const calldata = encodeFunctionData({
          abi:          GRADUATION_VAULT_V4_ABI,
          functionName: "collectFees",
          args:         [],
        });

        return NextResponse.json({
          chain:        "arc",
          graduated:    true,
          vaultAddress,
          calldata,
          claimableUsdc,
          abi:          GRADUATION_VAULT_V4_ABI,
        });

      } else {
        // ── Pré-graduation : claimCreatorFees(to) sur BondingCurveArcV2 ───────
        const raw = await arcPublicClient.readContract({
          address:      curveAddress,
          abi:          BONDING_CURVE_V2_ABI,
          functionName: "creatorAccrued",
        }).catch(() => 0n);

        if (raw === 0n) {
          return NextResponse.json({ error: "Nothing to claim — no fees accumulated yet" }, { status: 409 });
        }

        const claimableUsdc = Number(raw) / 1e18; // 18 dec natif Arc

        const calldata = encodeFunctionData({
          abi:          BONDING_CURVE_V2_ABI,
          functionName: "claimCreatorFees",
          args:         [body.walletAddress as `0x${string}`],
        });

        return NextResponse.json({
          chain:        "arc",
          graduated:    false,
          curveAddress,
          calldata,
          claimableUsdc,
          abi:          BONDING_CURVE_V2_ABI,
        });
      }
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
