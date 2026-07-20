import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { TREASURY_ADDRESS, USDC_MINT } from "@/lib/market/betting";

// M-01 fix: prefer SOLANA_RPC_URL env var (Helius/QuickNode) to avoid rate limits.
// Same priority logic as app/api/solana/rpc/route.ts.
function getRpcUrls(): string[] {
  const envUrl = process.env.SOLANA_RPC_URL;
  const fallbacks = [
    "https://solana-rpc.publicnode.com",
    "https://api.mainnet-beta.solana.com",
    "https://rpc.ankr.com/solana",
  ];
  return envUrl ? [envUrl, ...fallbacks] : fallbacks;
}

/**
 * Verifies on-chain that tx_signature:
 *  1. Is confirmed
 *  2. Transferred at least `expectedUsdc` USDC (6 decimals)
 *  3. Destination is TREASURY_ADDRESS
 * Returns null on success, error string on failure.
 */
async function verifyUsdcTransfer(
  txSignature: string,
  expectedUsdc: number,
): Promise<string | null> {
  const expectedLamports = Math.round(expectedUsdc * 1_000_000);

  for (const rpc of getRpcUrls()) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTransaction",
          params: [
            txSignature,
            { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
          ],
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) continue;
      const json = await res.json() as { result: any; error?: any };
      if (json.error || !json.result) continue;

      const tx = json.result;

      // Must be confirmed (err is null when successful, non-null = failed)
      if (tx.meta?.err != null) return "Transaction failed on-chain";

      // Look for a token transfer instruction to treasury
      const instructions: any[] = tx.transaction?.message?.instructions ?? [];
      const innerInstructions: any[] = (tx.meta?.innerInstructions ?? [])
        .flatMap((ii: any) => ii.instructions ?? []);
      const allInstructions = [...instructions, ...innerInstructions];

      let found = false;
      for (const ix of allInstructions) {
        const parsed = ix.parsed;
        if (!parsed) continue;

        // SPL Token transfer or transferChecked
        if (
          (parsed.type === "transfer" || parsed.type === "transferChecked") &&
          ix.program === "spl-token"
        ) {
          const info = parsed.info ?? {};
          const dest: string = info.destination ?? info.account ?? "";
          const mintAddr: string = info.mint ?? "";
          const rawAmount: number =
            parsed.type === "transferChecked"
              ? Number(info.tokenAmount?.amount ?? 0)
              : Number(info.amount ?? 0);

          // Check mint is USDC and destination is treasury ATA or treasury itself
          const isUsdc = mintAddr === USDC_MINT || mintAddr === "";
          const isDest =
            dest.toLowerCase().includes(TREASURY_ADDRESS.toLowerCase()) ||
            dest === TREASURY_ADDRESS;

          if (isUsdc && isDest && rawAmount >= expectedLamports) {
            found = true;
            break;
          }
          // Also accept if destination account owner is treasury (via postTokenBalances)
          const postBalances: any[] = tx.meta?.postTokenBalances ?? [];
          for (const bal of postBalances) {
            if (
              bal.owner === TREASURY_ADDRESS &&
              bal.mint === USDC_MINT
            ) {
              const preBalances: any[] = tx.meta?.preTokenBalances ?? [];
              const pre = preBalances.find((b: any) => b.accountIndex === bal.accountIndex);
              const preAmt = Number(pre?.uiTokenAmount?.amount ?? 0);
              const postAmt = Number(bal.uiTokenAmount?.amount ?? 0);
              if (postAmt - preAmt >= expectedLamports) {
                found = true;
                break;
              }
            }
          }
          if (found) break;
        }
      }

      // Fallback: check via postTokenBalances delta (most reliable)
      if (!found) {
        const postBalances: any[] = tx.meta?.postTokenBalances ?? [];
        const preBalances: any[] = tx.meta?.preTokenBalances ?? [];
        for (const bal of postBalances) {
          if (bal.owner === TREASURY_ADDRESS && bal.mint === USDC_MINT) {
            const pre = preBalances.find((b: any) => b.accountIndex === bal.accountIndex);
            const preAmt = Number(pre?.uiTokenAmount?.amount ?? 0);
            const postAmt = Number(bal.uiTokenAmount?.amount ?? 0);
            if (postAmt - preAmt >= expectedLamports) {
              found = true;
              break;
            }
          }
        }
      }

      if (!found) return `No USDC transfer of $${expectedUsdc} to treasury found in transaction`;
      return null; // success
    } catch {
      // try next RPC
    }
  }
  return "Could not verify transaction (RPC unavailable)";
}

/**
 * POST /api/updown/bet
 * Called after on-chain USDC transfer succeeds.
 * Inserts bet + atomically increments pool_up or pool_down.
 */
export async function POST(req: Request) {
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
  if (wallet_address !== sessionWallet) {
    return NextResponse.json({ error: "Wallet mismatch" }, { status: 403 });
  }

  const admin = createAdminClient() as any;

  // 3. Verify market is still open for betting
  const { data: market, error: mErr } = await admin
    .from("updown_markets")
    .select("id, status, closes_at")
    .eq("id", market_id)
    .single();

  if (mErr || !market) {
    return NextResponse.json({ error: "Market not found" }, { status: 404 });
  }
  if (market.status !== "open") {
    return NextResponse.json({ error: "Market is closed" }, { status: 409 });
  }
  if (new Date(market.closes_at) <= new Date()) {
    return NextResponse.json({ error: "Betting phase has ended" }, { status: 409 });
  }

  // 4. Verify on-chain: tx really transferred `amount` USDC to treasury
  const verifyError = await verifyUsdcTransfer(tx_signature, amount);
  if (verifyError) {
    return NextResponse.json({ error: `Transaction invalid: ${verifyError}` }, { status: 422 });
  }

  // 5. Insert bet (tx_signature unique prevents double-submit)
  // BUG-UD-4 FIX: insérer en "pending" — l'admin approuve via /api/admin/updown/bets.
  // Le pool est incrémenté à l'approbation (cohérent avec les autres marchés).
  const { error: betErr } = await admin.from("updown_bets").insert({
    id:             crypto.randomUUID(),
    market_id,
    wallet_address,
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
}
