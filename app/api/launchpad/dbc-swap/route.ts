/**
 * POST /api/launchpad/dbc-swap
 *
 * Builds a Meteora DBC swap transaction server-side (buy OR sell).
 *
 * Body: { poolAddress, mintAddress, walletAddress, amountIn, slippageBps, swapBaseForQuote }
 *   swapBaseForQuote: false = buy  (quote → token),  amountIn in quote raw units (lamports for SOL, token units for xStock)
 *   swapBaseForQuote: true  = sell (token → quote),  amountIn in raw base token units
 *
 * Response: { txBase64, estimatedOut, amountIn } | { error }
 *   Buy:  estimatedOut = raw token units
 *   Sell: estimatedOut = lamports
 */

import { limited } from "@/lib/limit";
import { DOGE_MINT } from "@/lib/solana/doge";
import { pairQuoteByMint } from "@/lib/solana/quotes";
import { NextResponse } from "next/server";
import { solanaConnection } from "@/lib/solana/rpc";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { resolveRef } from "@/lib/swap/chill-server";
import { CHILL_SHARE_BPS, cutOf } from "@/lib/swap/chill";
import { SOL_MINT, SWAP_FEE_BPS, SWAP_FEE_WALLET } from "@/lib/swap/core";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

function getConnection() {
  return solanaConnection();
}

function tryPublicKey(str: string): PublicKey | null {
  try { return new PublicKey(str); } catch { return null; }
}

/** Monnaie de paire d'un pool DBC (ne change jamais : gardée en mémoire). */
const QUOTE_CACHE = new Map<string, string>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function poolQuoteMint(client: any, pool: PublicKey): Promise<string> {
  const k = pool.toBase58();
  const hit = QUOTE_CACHE.get(k);
  if (hit) return hit;
  const vp = await client.state.getPool(pool);
  const cfg = await client.state.getPoolConfig(vp.poolState.config);
  const q = cfg.quoteMint.toBase58();
  if (QUOTE_CACHE.size > 5000) QUOTE_CACHE.clear();
  QUOTE_CACHE.set(k, q);
  return q;
}

export async function POST(req: Request) {
  { const lim = await limited(req, "dbc-swap", 60); if (lim) return lim; }
  try {
    const body = await req.json() as {
      poolAddress?:      string;
      mintAddress?:      string;
      walletAddress?:    string;
      amountIn?:         number;   // quote raw units (buy) OR raw base token units (sell) — must be integer ≥ 1
      slippageBps?:      number;
      swapBaseForQuote?: boolean;  // false = buy, true = sell
      ref?:              string;   // « Chill ton sac » : post du détenteur (+0,3 % : 0,12 % détenteur, 0,18 % OM)
      quoteMint?:        string;   // monnaie de paire vue par l'écran d'achat (SOL par défaut)
    };

    const {
      poolAddress,
      walletAddress,
      amountIn,
      slippageBps: rawSlippage = 100,
      swapBaseForQuote = false,
    } = body;
    // Glissement borné entre 0,1 % et 10 %
    const slippageBps = Math.min(1000, Math.max(10, Math.floor(Number(rawSlippage) || 100)));

    // ── Input validation ────────────────────────────────────────────────────────
    if (!poolAddress || !walletAddress || !amountIn) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // amountIn must be a positive integer (lamports or raw token units, never a float)
    if (!Number.isInteger(amountIn) || amountIn < 1) {
      return NextResponse.json(
        { error: "amountIn must be a positive integer (lamports or raw token units)" },
        { status: 400 },
      );
    }

    const poolPk = tryPublicKey(poolAddress);
    const userPk = tryPublicKey(walletAddress);
    if (!poolPk) return NextResponse.json({ error: "Invalid pool address" }, { status: 400 });
    if (!userPk) return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });

    // ── Load DBC SDK ─────────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let DynamicBondingCurveClient: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let BN: any;
    try {
      const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
      DynamicBondingCurveClient = sdk.DynamicBondingCurveClient;
      const bnMod = await import("bn.js");
      BN = bnMod.default ?? bnMod;
    } catch {
      return NextResponse.json({ error: "DBC SDK not installed" }, { status: 500 });
    }

    const connection  = getConnection();
    const client      = new DynamicBondingCurveClient(connection, "confirmed");

    // Pool DSOL-20 (paire DOGE) : l'écran doit compter en DOGE, sinon les montants seraient faux (SOL ≠ DOGE)
    if (!swapBaseForQuote) {
      const q = await poolQuoteMint(client, poolPk).catch(() => null);
      if (q === DOGE_MINT && body.quoteMint !== DOGE_MINT) {
        return NextResponse.json({ error: "This token trades in DOGE. Open its page to buy it." }, { status: 400 });
      }
      // Même règle pour les pools PEPE et CLT
      const pq = q ? pairQuoteByMint(q) : null;
      if (pq && body.quoteMint !== pq.mint) {
        return NextResponse.json({ error: `This token trades in ${pq.symbol}. Open its page to buy it.` }, { status: 400 });
      }
    }

    // « Chill ton sac » : seulement pour un pool en SOL et un post valide (détenteur ≥ 1 $, pas soi-même)
    let ref: { wallet: string; shareBps: number } | null = null;
    if (body.ref && body.mintAddress) {
      try {
        const vp = await client.state.getPool(poolPk);
        const cfg = await client.state.getPoolConfig(vp.poolState.config);
        if (cfg.quoteMint?.toBase58?.() === SOL_MINT) ref = await resolveRef(body.ref, walletAddress, SOL_MINT, body.mintAddress);
      } catch { ref = null; }
    }
    // Part du détenteur selon son niveau Omero (10 % à 40 % des frais)
    const shareBps = ref ? Math.min(CHILL_SHARE_BPS, ref.shareBps) : CHILL_SHARE_BPS;
    const omBps = SWAP_FEE_BPS - shareBps;
    // Achat : les frais sont retirés du SOL échangé, le total payé reste celui saisi
    const buyOm  = ref && !swapBaseForQuote ? cutOf(BigInt(amountIn), omBps) : 0n;
    const buyRef = ref && !swapBaseForQuote ? cutOf(BigInt(amountIn), shareBps) : 0n;
    const amountInBN  = new BN((BigInt(amountIn) - buyOm - buyRef).toString());

    // ── Quote estimation via SDK ─────────────────────────────────────────────
    let estimatedOut     = 0;
    let minimumAmountOut = new BN(0);

    try {
      const virtualPool = await client.state.getPool(poolPk);
      const config      = await client.state.getPoolConfig(virtualPool.poolState.config);

      const quote = client.pool.swapQuote({
        virtualPool,
        config,
        swapBaseForQuote,
        amountIn:                       amountInBN,
        slippageBps,
        hasReferral:                    false,
        currentPoint:                   null,
        eligibleForFirstSwapWithMinFee: false,
      });

      estimatedOut     = parseInt(quote.outputAmount.toString(), 10);
      minimumAmountOut = quote.minimumAmountOut ?? new BN(0);
    } catch (e) {
      // Sans devis, pas de prix plancher : on refuse au lieu d'envoyer un swap sans protection (attaque sandwich)
      console.warn("[dbc-swap] quote estimation failed:", e instanceof Error ? e.message : e);
      return NextResponse.json({ error: "Could not get a price right now, retry in a few seconds" }, { status: 502 });
    }
    if (minimumAmountOut.isZero()) return NextResponse.json({ error: "Amount too small" }, { status: 400 });

    // ── Build swap transaction ───────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let swapTx: any;
    try {
      swapTx = await client.pool.swap({
        owner:                userPk,
        pool:                 poolPk,
        amountIn:             amountInBN,
        minimumAmountOut,
        swapBaseForQuote,
        referralTokenAccount: null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to build transaction";
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    // ── « Chill ton sac » : virements dans la même transaction ─────────────────
    let refBps = 0;
    if (ref && "instructions" in swapTx && Array.isArray(swapTx.instructions)) {
      const user = userPk;
      if (!swapBaseForQuote) {
        swapTx.instructions.unshift(
          SystemProgram.transfer({ fromPubkey: user, toPubkey: new PublicKey(SWAP_FEE_WALLET), lamports: buyOm }),
          SystemProgram.transfer({ fromPubkey: user, toPubkey: new PublicKey(ref.wallet), lamports: buyRef }),
        );
      } else {
        // Vente : pris sur le minimum garanti, après le swap
        const minOut = BigInt(minimumAmountOut.toString());
        const om = cutOf(minOut, omBps), rf = cutOf(minOut, shareBps);
        if (om > 0n) swapTx.instructions.push(SystemProgram.transfer({ fromPubkey: user, toPubkey: new PublicKey(SWAP_FEE_WALLET), lamports: om }));
        if (rf > 0n) swapTx.instructions.push(SystemProgram.transfer({ fromPubkey: user, toPubkey: new PublicKey(ref.wallet), lamports: rf }));
        estimatedOut = Math.max(0, estimatedOut - Math.floor((estimatedOut * SWAP_FEE_BPS) / 10_000));
      }
      refBps = shareBps;
    }

    // ── Attach blockhash and serialize ───────────────────────────────────────
    const { blockhash } = await connection.getLatestBlockhash("confirmed");

    const isLegacy = "instructions" in swapTx && Array.isArray(swapTx.instructions);
    let serialized: Uint8Array;
    if (isLegacy) {
      swapTx.recentBlockhash = blockhash;
      swapTx.feePayer        = userPk;
      serialized = swapTx.serialize({ requireAllSignatures: false });
    } else {
      serialized = swapTx.serialize();
    }

    const txBase64 = Buffer.from(serialized).toString("base64");

    return NextResponse.json({ txBase64, estimatedOut, amountIn, refBps, ref: refBps ? ref?.wallet ?? null : null });

  } catch (err) {
    console.error("[dbc-swap] error:", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
