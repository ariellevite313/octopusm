import { rateHit } from "@/lib/rate-limit";
import { isBanned } from "@/lib/moderation";
import { claimPayment, releasePayment } from "@/lib/payments/used";
import { NextResponse } from "next/server";
import { recordAttribution } from "@/lib/social/share-rewards";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { ARC_BETS_ADDRESS } from "@/lib/arc-bets";
import { verifyArcTransfer } from "@/lib/arc-verify";
import { checkSolanaTransfer } from "@/lib/solana/verify-transfer";
import { currentAgentWallet } from "@/lib/social/session";

/**
 * POST /api/pools/predict
 * Called by pool-betting.ts after on-chain transfer succeeds.
 * Inserts a pending payment row using the admin client (bypasses RLS).
 * wallet_address is verified against the authenticated session.
 */
export async function POST(req: Request) {
  // BUG-03 fix: verify authenticated session before accepting any body data
  const supabase = await createClient();
  const { data: { user } } = await (supabase as any).auth.getUser();
  // Wallet d'IA (serveur uniquement, jamais lu depuis la requête), sinon la session
  const sessionWallet: string | null = currentAgentWallet() ?? user?.app_metadata?.wallet_address ?? null;
  if (!sessionWallet) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (await isBanned(sessionWallet, true)) return NextResponse.json({ error: "This account is suspended" }, { status: 403 });
  if (!(await rateHit(`bet:${sessionWallet}`, 30, 600_000))) return NextResponse.json({ error: "Too many bets, slow down" }, { status: 429 });

  let body: {
    payment_request_id: string;
    payment_reference:  string;
    title:              string;
    subtitle:           string;
    market_id:          string;
    selection_id:       string;
    selection_label:    string;
    amount_usdc:        number;
    token:              string;
    tx_signature:       string;
    wallet_address:     string;
    chain?:             string;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  if (!body.market_id || !body.selection_id || !body.amount_usdc || !body.tx_signature || !body.wallet_address) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (typeof body.amount_usdc !== "number" || !Number.isFinite(body.amount_usdc) || body.amount_usdc <= 0 || body.amount_usdc > 1e12) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }
  if (body.token !== "usdc" && body.token !== "clawdtrust") return NextResponse.json({ error: "Unsupported token" }, { status: 400 });
  if (body.chain === "arc") body.tx_signature = body.tx_signature.toLowerCase();

  // BUG-03 fix: wallet in body must match authenticated session
  const isArc = body.chain === "arc";
  const sameWallet = isArc
    ? body.wallet_address.toLowerCase() === sessionWallet.toLowerCase()
    : body.wallet_address === sessionWallet;
  if (!sameWallet) {
    return NextResponse.json({ error: "Wallet mismatch" }, { status: 403 });
  }
  if (isArc) {
    if (body.token !== "usdc") return NextResponse.json({ error: "Arc bets use USDC only" }, { status: 400 });
    const v = await verifyArcTransfer({ hash: body.tx_signature, from: body.wallet_address, minUsdc: Number(body.amount_usdc) });
    if (v === "mismatch") return NextResponse.json({ error: "Transaction does not match this bet" }, { status: 400 });
    if (v === "unverified") return NextResponse.json({ error: "Could not confirm the transaction yet, retry in a few seconds" }, { status: 503 });
  } else {
    const v = await checkSolanaTransfer(body.tx_signature, body.token, Number(body.amount_usdc), sessionWallet);
    if (v === "mismatch") return NextResponse.json({ error: "Transaction does not match this bet" }, { status: 400 });
    if (v === "unverified") return NextResponse.json({ error: "Could not confirm the transaction yet, retry in a few seconds" }, { status: 503 });
  }

  const minAmt = body.token === "usdc" ? 2 : 500_000;
  if (body.amount_usdc < minAmt) {
    return NextResponse.json({ error: "Amount below minimum stake" }, { status: 400 });
  }

  const admin = createAdminClient() as any;

  // BUG-11 fix: validate market exists, is active, and betting window is open
  const { data: market, error: mErr } = await admin
    .from("mutuel_markets")
    .select("id, status, betting_closes_at, options")
    .eq("id", body.market_id)
    .maybeSingle();

  if (mErr || !market) {
    return NextResponse.json({ error: "Market not found" }, { status: 404 });
  }
  if (market.status !== "active") {
    return NextResponse.json({ error: "Market is not accepting bets" }, { status: 400 });
  }
  if (market.betting_closes_at && new Date(market.betting_closes_at) < new Date()) {
    return NextResponse.json({ error: "Betting window has closed" }, { status: 400 });
  }
  const options = typeof market.options === "string" ? JSON.parse(market.options) : market.options;
  const validOption = (options ?? []).some((o: { id: string }) => o.id === body.selection_id);
  if (!validOption) {
    return NextResponse.json({ error: "Invalid selection" }, { status: 400 });
  }

  // Un marché = une seule monnaie. Sans colonne dédiée, la monnaie est celle de la première mise (payée ou approuvée) :
  // sinon une mise en CLT gonflerait un pool USDC et les gagnants retireraient des USDC qui n'existent pas.
  // bet_token est lu à part : si la colonne n'existe pas, la requête échoue sans bloquer le pari
  const [{ data: tokRow }, { data: firstBet }, { data: firstPay }] = await Promise.all([
    admin.from("mutuel_markets").select("bet_token").eq("id", body.market_id).maybeSingle(),
    admin.from("mutuel_bets").select("token").eq("market_id", body.market_id).limit(1).maybeSingle(),
    admin.from("payments").select("token").eq("market_id", body.market_id).eq("flow", "pool_prediction").neq("status", "rejected").limit(1).maybeSingle(),
  ]);
  const marketToken = (tokRow?.bet_token ?? firstBet?.token ?? firstPay?.token) as string | undefined;
  if (marketToken && marketToken !== body.token) {
    return NextResponse.json({ error: `This market takes ${marketToken === "usdc" ? "USDC" : "CLT"} only` }, { status: 400 });
  }

  // Une transaction ne paie qu'une seule chose, tous flux confondus
  if (!(await claimPayment(body.tx_signature, "pool_prediction", body.wallet_address))) {
    return NextResponse.json({ error: "This transaction has already been used" }, { status: 409 });
  }
  const { error } = await admin.from("payments").insert({
    id:                 crypto.randomUUID(),
    payment_request_id: body.payment_request_id,
    payment_reference:  body.payment_reference,
    flow:               "pool_prediction",
    title:              body.title,
    subtitle:           body.subtitle,
    category_label:     "pool",
    market_id:          body.market_id,
    selection_id:       body.selection_id,
    selection_label:    body.selection_label,
    user_wallet:        body.wallet_address,
    recipient_wallet:   isArc ? ARC_BETS_ADDRESS : (process.env.NEXT_PUBLIC_TREASURY_ADDRESS ?? "EsR6usyjCzhgL6dZFqHRsw6pDh7CgvfHtkQzCybJMuCZ"),
    amount_usdc:        body.amount_usdc,
    reserve_fee_usdc:   0,
    total_paid_usdc:    body.amount_usdc,
    token:              body.token,
    status:             "pending",
    tx_signature:       body.tx_signature,
  });

  if (error) {
    if (error.code !== "23505") await releasePayment(body.tx_signature);
    if (error.code === "23505") {
      return NextResponse.json({ error: "Transaction already submitted" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Pari venu d'un post du fil : attribué à son auteur (récompense de partage)
  await recordAttribution((body as { share_post_id?: unknown }).share_post_id, body.wallet_address, "pool", body.market_id);

  return NextResponse.json({ ok: true });
}
