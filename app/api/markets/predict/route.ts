import { NextResponse } from "next/server";
import { recordAttribution } from "@/lib/social/share-rewards";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { ARC_BETS_ADDRESS } from "@/lib/arc-bets";
import { verifyArcTransfer } from "@/lib/arc-verify";
import { checkSolanaTransfer } from "@/lib/solana/verify-transfer";

/**
 * POST /api/markets/predict
 * Called by betting.ts after on-chain transfer succeeds.
 * Inserts a pending payment row using the admin client (bypasses RLS).
 * wallet_address is verified against the authenticated session (C-01 fix).
 */
export async function POST(req: Request) {
  // C-01 fix: verify authenticated session before accepting any body data
  const supabase = await createClient();
  const { data: { user } } = await (supabase as any).auth.getUser();
  const sessionWallet: string | null = user?.app_metadata?.wallet_address ?? null;
  if (!sessionWallet) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: {
    payment_request_id: string;
    payment_reference:  string;
    title:              string;
    subtitle:           string;
    category_label:     string;
    market_id:          string;
    selection_id:       string;
    selection_label:    string;
    amount_usdc:        number;
    reserve_fee_usdc:   number;
    total_paid_usdc:    number;
    token:              string;
    chain?:             string;
    tx_signature?:      string;
    wallet_address:     string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    !body.market_id || !body.selection_id || !body.wallet_address ||
    !body.payment_reference || body.amount_usdc === undefined
  ) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const isArc = body.chain === "arc";

  // Montants : finis, positifs, cohérents entre eux (le client ne décide pas de la mise créditée)
  const nums = [body.amount_usdc, body.reserve_fee_usdc ?? 0, body.total_paid_usdc];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n)) || body.amount_usdc <= 0 || (body.reserve_fee_usdc ?? 0) < 0 || body.total_paid_usdc <= 0 || body.total_paid_usdc > 1e9) {
    return NextResponse.json({ error: "Invalid amounts" }, { status: 400 });
  }
  if (Math.abs(body.amount_usdc + (body.reserve_fee_usdc ?? 0) - body.total_paid_usdc) > 1e-6) {
    return NextResponse.json({ error: "Amounts do not add up" }, { status: 400 });
  }
  if (!body.tx_signature) return NextResponse.json({ error: "tx_signature is required" }, { status: 400 });
  if (isArc) body.tx_signature = body.tx_signature.toLowerCase(); // un même hash ne s'enregistre qu'une fois, quelle que soit la casse

  // C-01 fix: wallet in body must match authenticated session (adresses EVM : insensible à la casse)
  const sameWallet = isArc
    ? body.wallet_address.toLowerCase() === sessionWallet.toLowerCase()
    : body.wallet_address === sessionWallet;
  if (!sameWallet) {
    return NextResponse.json({ error: "Wallet mismatch" }, { status: 403 });
  }

  // Arc : seulement en USDC, et la transaction doit réellement avoir payé l'adresse des paris
  if (isArc) {
    if (body.token !== "usdc") {
      return NextResponse.json({ error: "Arc bets use USDC only" }, { status: 400 });
    }
    if (!body.tx_signature || !/^0x[0-9a-fA-F]{64}$/.test(body.tx_signature)) {
      return NextResponse.json({ error: "Invalid Arc transaction hash" }, { status: 400 });
    }
    const v = await verifyArcTransfer({ hash: body.tx_signature, from: body.wallet_address, minUsdc: Number(body.total_paid_usdc) });
    if (v === "mismatch") {
      return NextResponse.json({ error: "Transaction does not match this bet" }, { status: 400 });
    }
    if (v === "unverified") return NextResponse.json({ error: "Could not confirm the transaction yet, retry in a few seconds" }, { status: 503 });
  } else {
    if (body.token !== "usdc" && body.token !== "clawdtrust") return NextResponse.json({ error: "Unsupported token" }, { status: 400 });
    const v = await checkSolanaTransfer(body.tx_signature, body.token, Number(body.total_paid_usdc), sessionWallet);
    if (v === "mismatch") {
      return NextResponse.json({ error: "Transaction does not match this bet" }, { status: 400 });
    }
    if (v === "unverified") return NextResponse.json({ error: "Could not confirm the transaction yet, retry in a few seconds" }, { status: 503 });
  }

  const admin = createAdminClient() as any;

  const { error } = await admin.from("payments").insert({
    id:                 crypto.randomUUID(),
    payment_request_id: body.payment_request_id,
    payment_reference:  body.payment_reference,
    flow:               "prediction",
    title:              body.title,
    subtitle:           body.subtitle,
    category_label:     body.category_label,
    market_id:          body.market_id,
    selection_id:       body.selection_id,
    selection_label:    body.selection_label,
    user_wallet:        body.wallet_address,
    recipient_wallet:   isArc ? ARC_BETS_ADDRESS : (process.env.NEXT_PUBLIC_TREASURY_ADDRESS ?? "EsR6usyjCzhgL6dZFqHRsw6pDh7CgvfHtkQzCybJMuCZ"),
    amount_usdc:        body.amount_usdc,
    reserve_fee_usdc:   body.reserve_fee_usdc,
    total_paid_usdc:    body.total_paid_usdc,
    token:              body.token,
    status:             "pending",
    tx_signature:       body.tx_signature ?? null,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Transaction already submitted" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Pari venu d'un post du fil : attribué à son auteur (récompense de partage)
  await recordAttribution((body as { share_post_id?: unknown }).share_post_id, body.wallet_address, "prediction", body.market_id);

  return NextResponse.json({ ok: true });
}
