/**
 * POST /api/launchpad/[id]/prepare-tx
 *
 * Returns two base64 transactions:
 *   txABase64  — mint creation + Metaplex metadata + platform fee  (no warning in Phantom)
 *   txBBase64  — Meteora DBC pool creation only                    ("Proceed anyway" in Phantom)
 *
 * The on-chain mint check always runs BEFORE the cache so a retry after
 * TX A confirmed (but TX B was cancelled) never asks the user to pay again.
 */
import { NextResponse } from "next/server";
import { Keypair, Connection, PublicKey } from "@solana/web3.js";
import { createAdminClient } from "@/lib/supabase/server";
import { buildSplitPoolTransactions, buildMetadataJson } from "@/lib/solana/dbc";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
    const body = await req.json() as { walletAddress?: string };
    if (!body.walletAddress) {
      return NextResponse.json({ error: "walletAddress is required" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data: token, error } = await admin
      .from("launchpad_tokens")
      .select("id,creator_wallet,status,name,ticker,description,logo_url,website,twitter,telegram,supply,first_buy_amount,is_scheduled,mint_address,vanity_secret_key,metadata_uri,tx_base64,tx_prepared_at")
      .eq("id", id)
      .maybeSingle();

    if (error || !token) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }
    if (token.creator_wallet !== body.walletAddress) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (token.status !== "pending") {
      return NextResponse.json({ error: `Token is already ${token.status as string}` }, { status: 409 });
    }

    // ── Mint keypair ─────────────────────────────────────────────────────────
    let mintKeypair: Keypair;
    if (token.vanity_secret_key) {
      const secretBytes = Uint8Array.from(Buffer.from(token.vanity_secret_key as string, "base64"));
      if (secretBytes.length !== 64) {
        return NextResponse.json({ error: "Keypair corrompu. Supprime ce token et relance la création." }, { status: 422 });
      }
      mintKeypair = Keypair.fromSecretKey(secretBytes);
    } else {
      mintKeypair = Keypair.generate();
      const mintSecret  = Buffer.from(mintKeypair.secretKey).toString("base64");
      const mintAddress = mintKeypair.publicKey.toBase58();
      await admin.from("launchpad_tokens")
        .update({ mint_address: mintAddress, vanity_secret_key: mintSecret })
        .eq("id", id);
    }

    const metadataUri = (token.metadata_uri as string | null)
      ?? `https://omdot.fun/api/launchpad/${id}/metadata`;

    const dbcParams = {
      name:          token.name as string,
      symbol:        token.ticker as string,
      metadataUri,
      creatorWallet: token.creator_wallet as string,
      mintKeypair,
      totalSupply:   token.supply as number,
      firstBuySol:   (token.first_buy_amount as number) ?? 0,
      isScheduled:   Boolean(token.is_scheduled),
    };

    // ── On-chain mint check (always first, before cache) ─────────────────────
    // If TX A (mint creation) already landed, skip it — return only fresh TX B.
    if (token.mint_address) {
      try {
        const rpc = process.env.SOLANA_RPC_URL;
        if (rpc) {
          const conn = new Connection(rpc, "confirmed");
          const info = await conn.getAccountInfo(new PublicKey(token.mint_address as string));
          if (info !== null) {
            console.log("[prepare-tx] mint already on-chain — rebuilding TX B with fresh blockhash");

            // Reuse cached TX B instructions with fresh blockhash
            if (token.tx_base64) {
              try {
                const cached = JSON.parse(token.tx_base64 as string) as { a?: string; b?: string };
                if (cached.b) {
                  const { Transaction: Tx } = await import("@solana/web3.js");
                  const cachedTxB = Tx.from(Buffer.from(cached.b, "base64"));
                  const { blockhash } = await conn.getLatestBlockhash("confirmed");
                  const creator      = new PublicKey(body.walletAddress!);
                  const freshTxB     = new Tx({ recentBlockhash: blockhash, feePayer: creator });
                  for (const ix of cachedTxB.instructions) freshTxB.add(ix);
                  const mintStr = mintKeypair.publicKey.toBase58();
                  if (freshTxB.signatures.some((s: { publicKey: PublicKey }) => s.publicKey.toBase58() === mintStr)) {
                    freshTxB.partialSign(mintKeypair);
                  }
                  const txBBase64 = Buffer.from(freshTxB.serialize({ requireAllSignatures: false })).toString("base64");
                  await admin.from("launchpad_tokens")
                    .update({ tx_base64: JSON.stringify({ a: null, b: txBBase64 }), tx_prepared_at: new Date().toISOString() })
                    .eq("id", id);
                  return NextResponse.json({ txABase64: null, txBBase64, mintAddress: token.mint_address });
                }
              } catch (cacheErr) {
                console.warn("[prepare-tx] cached TX B rebuild failed:", cacheErr);
              }
            }
          }
        }
      } catch (e) {
        console.warn("[prepare-tx] on-chain mint check failed:", e);
      }
    }

    // ── Cache check (only when mint NOT yet on-chain) ─────────────────────────
    const cachedAt   = token.tx_prepared_at ? new Date(token.tx_prepared_at as string).getTime() : 0;
    const cacheAgeMs = Date.now() - cachedAt;
    if (token.tx_base64 && cacheAgeMs < 45_000) {
      try {
        const parsed = JSON.parse(token.tx_base64 as string) as { a: string; b: string };
        if (parsed.a && parsed.b) {
          return NextResponse.json({
            txABase64:   parsed.a,
            txBBase64:   parsed.b,
            mintAddress: token.mint_address,
          });
        }
      } catch { /* legacy cache — fall through */ }
    }

    // ── Build metadata ────────────────────────────────────────────────────────
    buildMetadataJson({
      name:          token.name as string,
      symbol:        token.ticker as string,
      description:   (token.description as string) ?? "",
      logoUrl:       (token.logo_url as string) ?? "https://omdot.fun/octomarket-logo.png",
      creatorWallet: token.creator_wallet as string,
      website:       token.website as string | undefined,
      twitter:       token.twitter as string | undefined,
      telegram:      token.telegram as string | undefined,
    });

    // ── Build split transactions ──────────────────────────────────────────────
    const { txABase64, txBBase64, mintAddress } = await buildSplitPoolTransactions(dbcParams);

    await admin.from("launchpad_tokens")
      .update({
        metadata_uri:   metadataUri,
        tx_base64:      JSON.stringify({ a: txABase64, b: txBBase64 }),
        tx_prepared_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({ txABase64, txBBase64, mintAddress });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("prepare-tx error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
