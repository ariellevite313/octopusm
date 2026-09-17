/**
 * GET /api/cron/arc-graduation
 *
 * Keeper cron — finalise automatiquement la graduation V4.
 *
 * Pour chaque token V4 dont `graduated = true` et `lpAdded = false` sur le hook,
 * appelle `addGraduationLiquidity(poolKey)` avec un wallet keeper côté serveur.
 *
 * Variables d'env requises :
 *   GRADUATION_KEEPER_PK  — clé privée (0x...) du wallet qui paie le gas
 *   CRON_SECRET           — bearer token (optionnel, auth Vercel cron)
 *
 * Vercel cron : toutes les 2 minutes
 * Arc : gas payé en USDC natif — le keeper wallet doit avoir du USDC.
 */

import { NextResponse }       from "next/server";
import { createPublicClient, createWalletClient, http, privateKeyToAccount } from "viem";
import { arc }                from "@/lib/arc-chain";
import {
  ARC_HOOK_ADDRESS,
  BONDING_CURVE_HOOK_ABI,
  getArcV4PoolKey,
  getArcV4PoolId,
}                             from "@/lib/arc-launchpad";
import { createAdminClient }  from "@/lib/supabase/server";

export const maxDuration = 60;

const RPC = "https://rpc.mainnet.arc.io";
const TIMEOUT_MS = 20_000;

function withTimeout<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T | null> {
  return Promise.race([p, new Promise<null>(r => setTimeout(() => r(null), ms))]);
}

export async function GET(req: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // ── Pré-conditions ────────────────────────────────────────────────────────
  if (!ARC_HOOK_ADDRESS) {
    return NextResponse.json({ skipped: true, reason: "Hook not deployed" });
  }

  const keeperPk = process.env.GRADUATION_KEEPER_PK as `0x${string}` | undefined;
  if (!keeperPk) {
    return NextResponse.json({ skipped: true, reason: "GRADUATION_KEEPER_PK not set" });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    // ── 1. Récupérer tous les tokens V4 actifs ────────────────────────────
    // V4 : arc_launch_id === mint_address
    const { data: tokens, error } = await admin
      .from("launchpad_tokens")
      .select("id, arc_launch_id, mint_address")
      .eq("chain", "arc")
      .in("status", ["active", "graduating"])
      .not("arc_launch_id", "is", null)
      .not("mint_address", "is", null);

    if (error) throw error;
    if (!tokens?.length) return NextResponse.json({ processed: 0 });

    type TokenRow = { id: string; arc_launch_id: string; mint_address: string };

    // Filtrer uniquement les V4 (arc_launch_id === mint_address)
    const v4Tokens = (tokens as TokenRow[]).filter(t =>
      t.arc_launch_id.toLowerCase() === t.mint_address.toLowerCase()
    );

    if (!v4Tokens.length) return NextResponse.json({ processed: 0, reason: "No V4 tokens" });

    // ── 2. Checker l'état on-chain de chaque token ────────────────────────
    const publicClient = createPublicClient({ chain: arc, transport: http(RPC) });

    const needsGrad: TokenRow[] = [];

    await Promise.all(v4Tokens.map(async (t) => {
      try {
        const poolId = getArcV4PoolId(t.mint_address as `0x${string}`);
        const state  = await withTimeout(publicClient.readContract({
          address:      ARC_HOOK_ADDRESS,
          abi:          BONDING_CURVE_HOOK_ABI,
          functionName: "getCurveState",
          args:         [poolId],
        })) as { graduated: boolean; lpAdded: boolean } | null;

        if (state?.graduated && !state.lpAdded) {
          needsGrad.push(t);
        }
      } catch { /* ignore — token may not have pool yet */ }
    }));

    if (!needsGrad.length) {
      return NextResponse.json({ processed: 0, reason: "No tokens need graduation" });
    }

    // ── 3. Envoyer addGraduationLiquidity pour chaque token ──────────────
    const account      = privateKeyToAccount(keeperPk);
    const walletClient = createWalletClient({ account, chain: arc, transport: http(RPC) });

    const results: { token: string; status: "sent" | "error"; hash?: string; error?: string }[] = [];

    for (const t of needsGrad) {
      try {
        const poolKey = getArcV4PoolKey(t.mint_address as `0x${string}`);
        const hash    = await withTimeout(walletClient.writeContract({
          address:      ARC_HOOK_ADDRESS,
          abi:          BONDING_CURVE_HOOK_ABI,
          functionName: "addGraduationLiquidity",
          args:         [poolKey],
          account,
          chain:        arc,
        }));

        if (hash) {
          results.push({ token: t.mint_address, status: "sent", hash });

          // Mettre à jour le statut en DB
          await admin
            .from("launchpad_tokens")
            .update({ status: "graduated" })
            .eq("id", t.id);

          console.log(`[arc-graduation] Graduated ${t.mint_address} → tx ${hash}`);
        } else {
          results.push({ token: t.mint_address, status: "error", error: "timeout" });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ token: t.mint_address, status: "error", error: msg });
        console.error(`[arc-graduation] Failed ${t.mint_address}:`, msg);
      }
    }

    const sent   = results.filter(r => r.status === "sent").length;
    const failed = results.filter(r => r.status === "error").length;

    console.log(`[arc-graduation] sent=${sent} failed=${failed}/${needsGrad.length}`);
    return NextResponse.json({ sent, failed, results });

  } catch (err) {
    console.error("[arc-graduation]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
