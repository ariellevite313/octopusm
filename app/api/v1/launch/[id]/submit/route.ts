/**
 * POST /api/v1/launch/{id}/submit
 * Body: { wallet, step: "a" | "b", signed_tx_base64 }
 * Broadcasts the signed transaction and waits (up to ~25s) for confirmation.
 *   step "a" → mint + metadata + platform fee (relayed as-is)
 *   step "b" → Meteora DBC pool; the server adds the mint signature and broadcasts
 */
import { POST as sendTx } from "@/app/api/launchpad/[id]/send-tx/route";
import { POST as cosignSend } from "@/app/api/launchpad/[id]/cosign-send/route";
import { BASE58_RE, callJson, lErr, lJson, lOk, waitConfirmed } from "@/lib/v1/launch";

type P = { params: Promise<{ id: string }> };
export async function OPTIONS() { return lOk(); }
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request, { params }: P) {
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { wallet?: string; step?: string; signed_tx_base64?: string };
  if (!b.wallet || !BASE58_RE.test(b.wallet)) return lErr("wallet must be a valid Solana address", 400);
  if (b.step !== "a" && b.step !== "b") return lErr('step must be "a" or "b"', 400);
  if (!b.signed_tx_base64) return lErr("signed_tx_base64 is required", 400);

  const r = await callJson((b.step === "a" ? sendTx : cosignSend) as never, id, {
    signedTransactionBase64: b.signed_tx_base64, walletAddress: b.wallet,
  });
  const sig = r.data.signature as string | undefined;
  if (r.status >= 400 || !sig) return lErr(String(r.data.error ?? "Broadcast failed"), r.status >= 400 ? r.status : 502);

  const status = await waitConfirmed(sig);
  if (status === "failed") return lErr("Transaction failed on-chain — call POST /api/v1/launch/{id} and retry", 422, { signature: sig });
  return lJson({ signature: sig, status });
}
