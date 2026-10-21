import { NextResponse } from "next/server";
import { createPublicClient, http, parseUnits } from "viem";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { arc } from "@/lib/arc-chain";
import { ARC_BETS_ADDRESS } from "@/lib/arc-bets";

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
  const sessionWallet: string | null = user?.user_metadata?.wallet_address ?? null;
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
    try {
      const client = createPublicClient({ chain: arc, transport: http("https://rpc.mainnet.arc.io") });
      const tx = await client.getTransaction({ hash: body.tx_signature as `0x${string}` });
      const expected = parseUnits(Number(body.total_paid_usdc).toFixed(6), 18);
      const ok =
        tx.from.toLowerCase() === body.wallet_address.toLowerCase() &&
        (tx.to ?? "").toLowerCase() === ARC_BETS_ADDRESS.toLowerCase() &&
        tx.value >= expected;
      if (!ok) {
        return NextResponse.json({ error: "Transaction does not match this bet" }, { status: 400 });
      }
    } catch (e) {
      // RPC indisponible / transaction pas encore visible : on enregistre en attente, l'admin vérifie à la validation
      console.warn("[markets/predict] Arc tx check skipped:", e);
    }
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

  return NextResponse.json({ ok: true });
}
