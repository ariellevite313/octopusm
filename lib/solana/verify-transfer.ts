/**
 * Server-side Solana transaction verifier.
 * Verifies that a tx signature contains a SPL token transfer
 * of at least `expectedAmount` (UI units) to TREASURY_ADDRESS.
 *
 * Works for both USDC (6 decimals) and CLT (9 decimals).
 */

import { TREASURY_ADDRESS, USDC_MINT, CLT_MINT } from "@/lib/market/betting";

export type TokenToVerify = "usdc" | "clawdtrust";

function getRpcUrls(): string[] {
  // Accept both SOLANA_RPC_URL (server-only) and NEXT_PUBLIC_SOLANA_RPC_URL (also available server-side)
  const envUrl = process.env.SOLANA_RPC_URL ?? process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  console.log("[verify-transfer] RPC env:", envUrl ? envUrl.slice(0, 50) + "..." : "NONE — using public fallbacks");
  const fallbacks = [
    "https://solana-rpc.publicnode.com",
    "https://api.mainnet-beta.solana.com",
    "https://rpc.ankr.com/solana",
  ];
  return envUrl ? [envUrl, ...fallbacks] : fallbacks;
}

/**
 * Returns null on success, error string on failure.
 */
// Solana takes 400ms–2s to confirm a tx. We retry up to MAX_ATTEMPTS times
// with RETRY_DELAY_MS between each attempt before giving up.
const MAX_ATTEMPTS  = 5;
const RETRY_DELAY_MS = 2000;

export async function verifyTokenTransfer(
  txSignature: string,
  token: TokenToVerify,
  expectedAmount: number, // UI units (e.g. 5 for 5 USDC, 500000 for 500K CLT)
): Promise<string | null> {
  const mintAddress = token === "clawdtrust" ? CLT_MINT : USDC_MINT;
  const decimals    = token === "clawdtrust" ? 9 : 6;
  const expectedRaw = Math.round(expectedAmount * Math.pow(10, decimals));
  const rpcs        = getRpcUrls();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Wait before retrying (not before the first attempt)
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }

    for (const rpc of rpcs) {
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const json = await res.json() as { result: any; error?: any };

        // result is null when the tx isn't confirmed yet — retry
        if (json.error || !json.result) {
          console.log(`[verify-transfer] attempt ${attempt + 1} rpc ${rpc.slice(0, 40)}: result null/error →`, json.error ?? "null result");
          continue;
        }

        const tx = json.result;

        // Transaction must have succeeded on-chain
        if (tx.meta?.err != null) return "Transaction failed on-chain";

        // ── Method 1: parse instructions directly ──────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const instructions: any[] = tx.transaction?.message?.instructions ?? [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const innerInstructions: any[] = (tx.meta?.innerInstructions ?? [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .flatMap((ii: any) => ii.instructions ?? []);
        const allIxs = [...instructions, ...innerInstructions];

        let found = false;
        for (const ix of allIxs) {
          const parsed = ix.parsed;
          if (!parsed || ix.program !== "spl-token") continue;
          if (parsed.type !== "transfer" && parsed.type !== "transferChecked") continue;

          const info = parsed.info ?? {};
          const dest: string     = info.destination ?? info.account ?? "";
          const mintAddr: string = info.mint ?? "";
          const rawAmount: number =
            parsed.type === "transferChecked"
              ? Number(info.tokenAmount?.amount ?? 0)
              : Number(info.amount ?? 0);

          const correctMint = mintAddr === mintAddress || mintAddr === "";
          const correctDest =
            dest === TREASURY_ADDRESS ||
            dest.toLowerCase().includes(TREASURY_ADDRESS.toLowerCase());

          if (correctMint && correctDest && rawAmount >= expectedRaw) {
            found = true;
            break;
          }
        }

        // ── Method 2 (most reliable): postTokenBalances delta ──────────────
        if (!found) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const postBalances: any[] = tx.meta?.postTokenBalances ?? [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const preBalances: any[]  = tx.meta?.preTokenBalances  ?? [];

          for (const bal of postBalances) {
            if (bal.owner !== TREASURY_ADDRESS || bal.mint !== mintAddress) continue;
            const pre = preBalances.find(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (b: any) => b.accountIndex === bal.accountIndex
            );
            const preAmt  = Number(pre?.uiTokenAmount?.amount ?? 0);
            const postAmt = Number(bal.uiTokenAmount?.amount  ?? 0);
            if (postAmt - preAmt >= expectedRaw) {
              found = true;
              break;
            }
          }
        }

        if (!found) {
          const symbol = token === "clawdtrust" ? "CLT" : "USDC";
          return `No ${symbol} transfer of ${expectedAmount} to treasury found in transaction`;
        }

        return null; // ✅ success
      } catch {
        // try next RPC
      }
    }
    // All RPCs returned null result → tx not yet confirmed, retry after delay
  }

  return "Could not verify transaction — please try again in a few seconds";
}
