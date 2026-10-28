import { isPausedDuration } from "@/lib/updown-pause";
import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { verifyArcTransfer } from "@/lib/arc-verify";
import { checkSolanaTransfer } from "@/lib/solana/verify-transfer";


/**
 * POST /api/updown/bet
 * Called after on-chain USDC transfer succeeds.
 * Inserts bet + atomically increments pool_up or pool_down.
 */
export async function POST(req: Request) {
  try {
  // 1. Auth: session Supabase requise
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const sessionWallet = user.user_metadata?.wallet_address as string | undefined;
  if (!sessionWallet) {
    return NextResponse.json({ error: "No wallet in session" }, { status: 401 });
  }

  const body = await req.json() as {
    market_id:      string;
    wallet_address: string;
    direction:      "up" | "down";
    amount:         number;
    tx_signature:   string;
    chain?:         string;
  };

  const { market_id, wallet_address, direction, amount, tx_signature } = body;

  if (!market_id || !wallet_address || !direction || !amount || !tx_signature) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!["up", "down"].includes(direction)) {
    return NextResponse.json({ error: "Invalid direction" }, { status: 400 });
  }
  if (amount <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }


  // 2. Wallet dans le body doit correspondre à la session
  const isArc = body.chain === "arc";
  const sameWallet = isArc
    ? wallet_address.toLowerCase() === sessionWallet.toLowerCase()
    : wallet_address === sessionWallet;
  if (!sameWallet) {
    return NextResponse.json({ error: "Wallet mismatch" }, { status: 403 });
  }
  if (isArc && !/^0x[0-9a-fA-F]{40}$/.test(wallet_address)) {
    return NextResponse.json({ error: "Invalid Arc wallet" }, { status: 400 });
  }

  const admin = createAdminClient() as any;

  // 3. Verify market is still open for betting
  const { data: market, error: mErr } = await admin
    .from("updown_markets")
    .select("id, status, closes_at, duration_min")
    .eq("id", market_id)
    .single();

  if (mErr || !market) {
    return NextResponse.json({ error: "Market not found" }, { status: 404 });
  }
  if (isPausedDuration(Number(market.duration_min))) {
    return NextResponse.json({ error: "Coming soon: this round length is paused for now." }, { status: 403 });
  }
  if (market.status !== "open") {
    return NextResponse.json({ error: "Market is closed" }, { status: 409 });
  }
  if (new Date(market.closes_at) <= new Date()) {
    return NextResponse.json({ error: "Betting phase has ended" }, { status: 409 });
  }

  // 3b. Vérification on-chain : la tx doit réellement avoir payé la mise
  if (isArc) {
    const v = await verifyArcTransfer({
      hash: tx_signature,
      from: wallet_address,
      minUsdc: Number(amount),
      memoIncludes: [`market=${market_id}`, `dir=${direction}`],
    });
    if (v === "mismatch") {
      return NextResponse.json({ error: "Transaction does not match this bet" }, { status: 400 });
    }
    // "unverified" (RPC indisponible) : enregistré en attente, l'admin vérifie à l'approbation
  } else {
    const v = await checkSolanaTransfer(tx_signature, "usdc", Number(amount));
    if (v === "mismatch") {
      return NextResponse.json({ error: "Transaction does not match this bet" }, { status: 400 });
    }
  }

  // 4. Insert bet (tx_signature unique prevents double-submit)
  // BUG-UD-4 FIX: insérer en "pending" — l'admin approuve via /api/admin/updown/bets.
  // Le pool est incrémenté à l'approbation (cohérent avec les autres marchés).
  const { error: betErr } = await admin.from("updown_bets").insert({
    id:             crypto.randomUUID(),
    market_id,
    wallet_address: isArc ? wallet_address.toLowerCase() : wallet_address,
    direction,
    amount,
    tx_signature,
    status:         "pending",
  });

  if (betErr) {
    if (betErr.code === "23505") {
      return NextResponse.json({ error: "Transaction already submitted" }, { status: 409 });
    }
    return NextResponse.json({ error: betErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[updown/bet] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
