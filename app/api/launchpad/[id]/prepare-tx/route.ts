/**
 * POST /api/launchpad/[id]/prepare-tx
 *
 * Builds the DBC pool creation transaction and returns it base64-encoded
 * for the client wallet to sign. The mint keypair (vanity address) is
 * pre-signed server-side.
 *
 * The client must:
 *  1. Deserialize the transaction
 *  2. Sign it with their wallet
 *  3. Send it to the network
 *  4. Call POST /api/launchpad/[id]/confirm with the tx signature
 *
 * Body: { walletAddress: string }
 */
import { NextResponse } from "next/server";
import { Keypair } from "@solana/web3.js";
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
      // Select only the columns needed server-side (vanity_secret_key required to rebuild mint keypair)
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
      return NextResponse.json(
        { error: `Token is already ${token.status as string}` },
        { status: 409 }
      );
    }

    // If a prepared transaction pair is already cached, return it.
    // Cache expires after 45s (Solana blockhash valid ~60s).
    const cachedAt   = token.tx_prepared_at ? new Date(token.tx_prepared_at as string).getTime() : 0;
    const cacheAgeMs = Date.now() - cachedAt;
    if (token.tx_base64 && cacheAgeMs < 45_000) {
      try {
        // tx_base64 may be a JSON object {a, b} for the split-tx flow
        const parsed = JSON.parse(token.tx_base64 as string) as { a: string; b: string };
        if (parsed.a && parsed.b) {
          return NextResponse.json({
            txABase64:   parsed.a,
            txBBase64:   parsed.b,
            mintAddress: token.mint_address,
          });
        }
      } catch {
        // Legacy single-tx cache — fall through and rebuild
      }
    }

    // ── Mint keypair — generated lazily at prepare-tx time ───────────────────
    // The keypair is generated here (not at creation time) so the CA is only
    // revealed when the user clicks Launch. On retry, the same keypair is reused
    // (vanity_secret_key already set) so the mint address stays stable.
    let mintKeypair: Keypair;
    if (token.vanity_secret_key) {
      // Reuse existing keypair (retry path)
      const secretBytes = Uint8Array.from(Buffer.from(token.vanity_secret_key as string, "base64"));
      if (secretBytes.length !== 64) {
        return NextResponse.json(
          { error: "Keypair corrompu. Supprime ce token et relance la création." },
          { status: 422 }
        );
      }
      mintKeypair = Keypair.fromSecretKey(secretBytes);
    } else {
      // First prepare-tx: generate a fresh keypair and persist it
      mintKeypair = Keypair.generate();
      const mintSecret  = Buffer.from(mintKeypair.secretKey).toString("base64");
      const mintAddress = mintKeypair.publicKey.toBase58();
      await admin
        .from("launchpad_tokens")
        .update({ mint_address: mintAddress, vanity_secret_key: mintSecret })
        .eq("id", id);
    }

    // Build metadata JSON — logo_url may be null if R2 upload is pending
    const metadataJson = buildMetadataJson({
      name:          token.name as string,
      symbol:        token.ticker as string,
      description:   (token.description as string) ?? "",
      logoUrl:       (token.logo_url as string) ?? "https://omdot.fun/octomarket-logo.png",
      creatorWallet: token.creator_wallet as string,
      website:       token.website as string | undefined,
      twitter:       token.twitter as string | undefined,
      telegram:      token.telegram as string | undefined,
    });

    // For now store metadata JSON directly; in production upload to R2 first
    // TODO: upload metadataJson to R2 and use the returned URL
    const metadataUri = (token.metadata_uri as string | null)
      ?? `https://omdot.fun/api/launchpad/${id}/metadata`;

    // Build split transactions (TX A: mint+metadata+fee, TX B: DBC pool)
    const { txABase64, txBBase64, mintAddress } = await buildSplitPoolTransactions({
      name:          token.name as string,
      symbol:        token.ticker as string,
      metadataUri,
      creatorWallet: token.creator_wallet as string,
      mintKeypair,
      totalSupply:   token.supply as number,
      firstBuySol:   (token.first_buy_amount as number) ?? 0,
      isScheduled:   Boolean(token.is_scheduled),
    });

    // Cache both txs as JSON in tx_base64
    await admin
      .from("launchpad_tokens")
      .update({
        metadata_uri:   metadataUri,
        tx_base64:      JSON.stringify({ a: txABase64, b: txBBase64 }),
        tx_prepared_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({
      txABase64,
      txBBase64,
      mintAddress,
      metadataJson,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("prepare-tx error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
