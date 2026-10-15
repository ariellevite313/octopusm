/**
 * /api/v1/launch — launch a Solana token from code (AI agents, bots, scripts).
 *
 *   GET  → machine-readable description of the flow
 *   POST → step 1: create the token + build the two transactions to sign
 *
 * Flow (all JSON):
 *   1. POST /api/v1/launch                      → { token_id, mint, tx_a, tx_b }
 *   2. sign tx_a with the creator keypair → POST /api/v1/launch/{id}/submit {step:"a", ...}
 *   3. sign tx_b with the creator keypair → POST /api/v1/launch/{id}/submit {step:"b", ...}
 *   4. POST /api/v1/launch/{id}/confirm {tx_signature, wallet}
 *
 * The server never holds the creator key: every transaction must be signed by the creator wallet.
 */
import { POST as createToken } from "@/app/api/launchpad/create/route";
import { POST as prepareTx } from "@/app/api/launchpad/[id]/prepare-tx/route";
import { BASE58_RE, callJson, getIp, hit, lErr, lJson, lOk } from "@/lib/v1/launch";

export async function OPTIONS() { return lOk(); }
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export async function GET() {
  return lJson({
    name: "OMdotfun agent launch API",
    version: "1.0.0",
    chain: "solana",
    docs: "https://omdot.fun/agents",
    steps: [
      { n: 1, method: "POST", path: "/api/v1/launch", body: "{ wallet, name, ticker, description, category?, logo_base64?, logo_mime?, website?, twitter?, telegram?, supply?, first_buy_sol? }", returns: "{ token_id, mint, tx_a, tx_b }" },
      { n: 2, method: "POST", path: "/api/v1/launch/{token_id}/submit", body: "{ wallet, step: \"a\", signed_tx_base64 }", returns: "{ signature, status }" },
      { n: 3, method: "POST", path: "/api/v1/launch/{token_id}/submit", body: "{ wallet, step: \"b\", signed_tx_base64 }", returns: "{ signature, status }" },
      { n: 4, method: "POST", path: "/api/v1/launch/{token_id}/confirm", body: "{ wallet, tx_signature }", returns: "{ ok, pool_address }" },
    ],
    limits: { launches_per_wallet_per_hour: 3, launches_per_ip_per_hour: 6, logo_max_bytes: MAX_LOGO_BYTES },
    categories: ["Meme", "Utility", "AI", "Gaming", "DeFi", "NFT", "x402"],
  });
}

type Body = {
  wallet?: string; name?: string; ticker?: string; description?: string; category?: string;
  logo_base64?: string; logo_mime?: string;
  website?: string; twitter?: string; telegram?: string; discord?: string;
  supply?: number; first_buy_sol?: number;
};

export async function POST(req: Request) {
  let b: Body;
  try { b = (await req.json()) as Body; } catch { return lErr("Invalid JSON body", 400); }

  const wallet = (b.wallet ?? "").trim();
  if (!BASE58_RE.test(wallet)) return lErr("wallet must be a valid Solana address", 400);
  if (!b.name?.trim() || !b.ticker?.trim()) return lErr("name and ticker are required", 400);
  if (!/^[A-Za-z0-9]{2,10}$/.test(b.ticker.trim())) return lErr("ticker must be 2-10 letters/digits", 400);
  if (b.name.trim().length > 32) return lErr("name must be 32 characters or fewer", 400);
  if ((b.description ?? "").length > 1000) return lErr("description too long (max 1000)", 400);

  const ip = getIp(req);
  if (!hit(`launch:w:${wallet}`, 3, 3_600_000) || !hit(`launch:ip:${ip}`, 6, 3_600_000)) {
    return lErr("Rate limit reached — try again later", 429);
  }

  const firstBuy = b.first_buy_sol && b.first_buy_sol > 0 ? Number(b.first_buy_sol) : 0;
  const payload = {
    name: b.name.trim(), ticker: b.ticker.trim().toUpperCase(),
    category: b.category ?? "Meme", description: b.description ?? "",
    website: b.website ?? "", twitter: b.twitter ?? "", telegram: b.telegram ?? "", discord: b.discord ?? "",
    supply: b.supply ?? 1_000_000_000, creator_fee_pct: 1,
    fee_recipients: [], share_top100: false, share_top100_pct: 5,
    first_buy_enabled: firstBuy > 0, first_buy_amount: firstBuy,
    is_scheduled: false, scheduled_at: null,
    creator_wallet: wallet, chain: "solana",
  };

  const form = new FormData();
  form.set("payload", JSON.stringify(payload));
  if (b.logo_base64) {
    const mime = b.logo_mime ?? "image/png";
    if (!LOGO_TYPES.has(mime)) return lErr("logo_mime must be png, jpeg, webp or gif", 400);
    const buf = Buffer.from(b.logo_base64, "base64");
    if (buf.length === 0 || buf.length > MAX_LOGO_BYTES) return lErr("logo must be 1 byte to 5 MB", 400);
    form.set("logo", new Blob([new Uint8Array(buf)], { type: mime }), `logo.${mime.split("/")[1]}`);
  }

  const created = await createToken(new Request("http://internal/", { method: "POST", body: form }));
  const cd = (await created.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!created.ok || !cd.id) return lErr(cd.error ?? "Could not create token", created.status || 500);

  const prep = await callJson(prepareTx as never, cd.id, { walletAddress: wallet });
  if (prep.status >= 400) return lErr(String(prep.data.error ?? "Could not prepare transactions"), prep.status, { token_id: cd.id });

  return lJson({
    token_id: cd.id,
    mint: prep.data.mintAddress ?? null,
    tx_a: prep.data.txABase64 ?? null,
    tx_b: prep.data.txBBase64 ?? null,
    note: "Sign each tx with the creator keypair (partialSign, keep existing signatures), then POST them to /submit in order a → b. Blockhashes expire in about 60s: sign quickly, or call POST /api/v1/launch/{id} with { wallet } to get fresh transactions.",
  }, 201);
}
