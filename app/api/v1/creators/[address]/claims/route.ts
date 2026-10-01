/**
 * GET /api/v1/creators/{address}/claims?limit=50&cursor=<ISO>
 *
 * Paginated claim history, newest-first.
 * Solana: { tx, mint, amount, currency: "SOL", timestamp }
 * Arc:    { tx, mint, amount, currency: "USDC", timestamp }
 */

import { createAdminClient } from "@/lib/supabase/server";
import {
  detectAddrType, json, err, corsOk, checkRateLimit, getIp,
} from "@/lib/v1/helpers";

export async function OPTIONS() { return corsOk(); }

export async function GET(
  req: Request,
  { params }: { params: { address: string } },
) {
  if (!checkRateLimit(getIp(req))) return err("Too Many Requests", 429);

  const raw      = params.address;
  const addrType = detectAddrType(raw);
  if (addrType === "invalid") return err("Invalid address", 400);
  const address = addrType === "evm" ? raw.toLowerCase() : raw;

  const { searchParams } = new URL(req.url);
  const limitRaw = parseInt(searchParams.get("limit") ?? "50", 10);
  const limit    = Math.min(Math.max(1, isNaN(limitRaw) ? 50 : limitRaw), 100);
  const cursor   = searchParams.get("cursor");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const isSolana  = addrType === "solana";
  const chainFilter = isSolana
    ? "chain.eq.solana,chain.is.null"
    : "chain.eq.arc";
  const walletFilter = isSolana
    ? { eq: ["wallet", address] }
    : { ilike: ["wallet", address] };

  let q = admin
    .from("creator_fee_claims")
    .select("tx_signature, token_id, amount_sol, amount_usdc, claim_type, claimed_at")
    .or(chainFilter)
    .order("claimed_at", { ascending: false })
    .limit(limit + 1);

  if (isSolana) {
    q = q.eq("wallet", address);
  } else {
    q = q.ilike("wallet", address);
  }
  if (cursor) q = q.lt("claimed_at", cursor);

  const { data: rows } = await q as {
    data: {
      tx_signature: string; token_id: string;
      amount_sol: string | null; amount_usdc: string | null;
      claim_type: string | null; claimed_at: string;
    }[] | null
  };

  const allRows = rows ?? [];
  const hasMore = allRows.length > limit;
  const items   = hasMore ? allRows.slice(0, limit) : allRows;

  // resolve token_id → mint_address
  const tokenIds = [...new Set(items.map(r => r.token_id))];
  const mintByToken: Record<string, string | null> = {};
  if (tokenIds.length > 0) {
    const { data: trows } = await admin
      .from("launchpad_tokens")
      .select("id, mint_address")
      .in("id", tokenIds);
    for (const t of (trows ?? []) as { id: string; mint_address: string | null }[]) {
      mintByToken[t.id] = t.mint_address;
    }
  }

  return json({
    items: items.map(r => ({
      tx:        r.tx_signature,
      mint:      mintByToken[r.token_id] ?? null,
      amount:    isSolana
        ? (parseFloat(r.amount_sol ?? "0")).toFixed(9).replace(/\.?0+$/, "") || "0"
        : (parseFloat(r.amount_usdc ?? "0")).toFixed(6),
      currency:   isSolana ? "SOL" : "USDC",
      claim_type: r.claim_type ?? "creator",
      timestamp:  r.claimed_at,
    })),
    next_cursor: hasMore ? items[items.length - 1].claimed_at : null,
  });
}

export const dynamic = "force-dynamic";
