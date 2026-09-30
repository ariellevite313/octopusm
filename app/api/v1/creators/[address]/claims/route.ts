/**
 * GET /api/v1/creators/{address}/claims?limit=50&cursor=<ISO timestamp>
 *
 * Paginated claim history for a creator (all their Arc tokens).
 * Sorted newest-first.
 *
 * Response:
 * {
 *   "items": [{
 *     "tx_hash":       "0x…",
 *     "token_address": "0x…",
 *     "amount_usdc":   "1.234567",
 *     "claim_type":    "creator" | "dividend",
 *     "timestamp":     "2026-09-21T12:00:00.000Z"
 *   }],
 *   "next_cursor": "2026-09-20T…" | null
 * }
 */

import { createAdminClient }          from "@/lib/supabase/server";
import {
  isValidEvm, json, err, corsOk, checkRateLimit, getIp,
} from "@/lib/v1/helpers";

export async function OPTIONS() { return corsOk(); }

export async function GET(
  req: Request,
  { params }: { params: { address: string } },
) {
  if (!checkRateLimit(getIp(req))) return err("Too Many Requests", 429);

  const address = params.address.toLowerCase();
  if (!isValidEvm(address)) return err("Invalid Arc address", 400);

  const { searchParams } = new URL(req.url);
  const limitRaw  = parseInt(searchParams.get("limit") ?? "50", 10);
  const limit     = Math.min(Math.max(1, isNaN(limitRaw) ? 50 : limitRaw), 100);
  const cursor    = searchParams.get("cursor"); // ISO timestamp

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Build query
  let q = admin
    .from("creator_fee_claims")
    .select("tx_signature, token_id, amount_usdc, claim_type, claimed_at")
    .eq("chain", "arc")
    .ilike("wallet", address)
    .order("claimed_at", { ascending: false })
    .limit(limit + 1); // fetch one extra to determine next_cursor

  if (cursor) {
    q = q.lt("claimed_at", cursor);
  }

  const { data: rows } = await q as {
    data: {
      tx_signature: string;
      token_id:     string;
      amount_usdc:  string | null;
      claim_type:   string | null;
      claimed_at:   string;
    }[] | null
  };

  const allRows = rows ?? [];
  const hasMore = allRows.length > limit;
  const items   = hasMore ? allRows.slice(0, limit) : allRows;

  // Resolve token_id → mint_address
  const tokenIds = [...new Set(items.map(r => r.token_id))];
  let mintByToken: Record<string, string | null> = {};
  if (tokenIds.length > 0) {
    const { data: tokenRows } = await admin
      .from("launchpad_tokens")
      .select("id, mint_address")
      .in("id", tokenIds);
    for (const t of (tokenRows ?? []) as { id: string; mint_address: string | null }[]) {
      mintByToken[t.id] = t.mint_address;
    }
  }

  const result = {
    items: items.map(r => ({
      tx_hash:       r.tx_signature,
      token_address: mintByToken[r.token_id] ?? null,
      amount_usdc:   parseFloat(r.amount_usdc ?? "0").toFixed(6),
      claim_type:    r.claim_type ?? "creator",
      timestamp:     r.claimed_at,
    })),
    next_cursor: hasMore ? items[items.length - 1].claimed_at : null,
  };

  return json(result);
}

export const dynamic = "force-dynamic";
