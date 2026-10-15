/**
 * GET  /api/v1/launch/{id}          → status of a launch
 * POST /api/v1/launch/{id}          → re-prepare fresh transactions (new blockhash), body { wallet }
 */
import { createAdminClient } from "@/lib/supabase/server";
import { POST as prepareTx } from "@/app/api/launchpad/[id]/prepare-tx/route";
import { BASE58_RE, callJson, lErr, lJson, lOk } from "@/lib/v1/launch";

type P = { params: Promise<{ id: string }> };
export async function OPTIONS() { return lOk(); }
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: P) {
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("launchpad_tokens")
    .select("id, status, name, ticker, mint_address, pool_address, is_tradeable")
    .eq("id", id).maybeSingle();
  if (!data) return lErr("Token not found", 404);
  return lJson({
    token_id: data.id, status: data.status, name: data.name, ticker: data.ticker,
    mint: data.mint_address ?? null, pool_address: data.pool_address ?? null, tradeable: data.is_tradeable,
    url: `https://omdot.fun/launchpad/${data.id}`,
  });
}

export async function POST(req: Request, { params }: P) {
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { wallet?: string };
  if (!b.wallet || !BASE58_RE.test(b.wallet)) return lErr("wallet must be a valid Solana address", 400);
  const prep = await callJson(prepareTx as never, id, { walletAddress: b.wallet });
  if (prep.status >= 400) return lErr(String(prep.data.error ?? "Could not prepare transactions"), prep.status);
  return lJson({ token_id: id, mint: prep.data.mintAddress ?? null, tx_a: prep.data.txABase64 ?? null, tx_b: prep.data.txBBase64 ?? null });
}
