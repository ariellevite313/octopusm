/**
 * POST /api/v1/launch/{id}/confirm
 * Body: { wallet, tx_signature }  (signature of step "b")
 * Marks the token live once the pool transaction is confirmed on-chain.
 */
import { POST as confirmRoute } from "@/app/api/launchpad/[id]/confirm/route";
import { BASE58_RE, callJson, lErr, lJson, lOk } from "@/lib/v1/launch";

type P = { params: Promise<{ id: string }> };
export async function OPTIONS() { return lOk(); }
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request, { params }: P) {
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { wallet?: string; tx_signature?: string };
  if (!b.wallet || !BASE58_RE.test(b.wallet)) return lErr("wallet must be a valid Solana address", 400);
  if (!b.tx_signature) return lErr("tx_signature is required", 400);
  const r = await callJson(confirmRoute as never, id, { txSignature: b.tx_signature, walletAddress: b.wallet });
  if (r.status === 202) return lErr("Not confirmed yet — retry in a few seconds", 202);
  if (r.status >= 400) return lErr(String(r.data.error ?? "Confirmation failed"), r.status);
  return lJson({ ok: true, status: r.data.status, pool_address: r.data.poolAddress ?? null, url: `https://omdot.fun/launchpad/${id}` });
}
