/**
 * POST /api/launchpad/[id]/prepare-tx
 *
 * SOL meme token path (stock_symbol = null):
 *   Returns { txABase64, txBBase64, mintAddress }
 *   TX A — platform fee only (no Phantom warning)
 *   TX B — Meteora DBC pool creation, which also creates the mint, + optional first buy
 *
 * xStock-paired path (stock_symbol set, e.g. "xNVDA"):
 *   Returns { txABase64, txBBase64, txCBase64, mintAddress, configAddress }
 *   TX A — platform fee only (Blowfish-safe)
 *   TX B — DBC createConfig (fresh keypair, quoteMint = xStock)
 *   TX C — DBC createPool (creates meme mint + metadata + pool + vaults)
 *
 * The mint only exists once the pool is created (the pool instruction creates it). If it is already
 * on chain, the token is activated directly ({ alreadyLaunched: true }) instead of rebuilding a pool tx
 * that can only fail. Once the fee is recorded (fee_paid_at), TX A is never asked again.
 *
 * For xStock retries where TX B (createConfig) already landed on-chain:
 *   Returns { txABase64: null, txBBase64: null, txCBase64, mintAddress, configAddress }
 *   The caller skips TX A+B and only presents TX C to the user.
 */
import { generateOmKeypair } from "@/lib/solana/vanity-mint";
import { DSOL_PREFIX, isDogeQuote } from "@/lib/solana/doge";
import { hasPairMark, pairQuoteByMint, type PairQuote } from "@/lib/solana/quotes";
import bs58 from "bs58";
import { XSTOCK_LAUNCH_ENABLED } from "@/lib/solana/xstocks";
import { solanaConnection } from "@/lib/solana/rpc";
import { NextResponse } from "next/server";
import { Keypair, Connection, PublicKey } from "@solana/web3.js";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { recoverPendingToken, RECOVER_MESSAGES, type PendingToken } from "@/lib/launch/recover-pool";
import {
  buildSplitPoolTransactions,
  buildStockPairedTransactions,
  buildMetadataJson,
  dogeLaunchEnabled,
  pairLaunchEnabled,
} from "@/lib/solana/dbc";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Enregistre l'adresse du token et sa clé, une seule fois (deux appels simultanés ne réservent pas deux clés).
 * Renvoie une réponse d'erreur si l'enregistrement échoue : on ne renvoie jamais une transaction dont la base n'a pas la clé.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function saveMint(admin: any, id: string, kp: Keypair): Promise<NextResponse | null> {
  const { data, error } = await admin.from("launchpad_tokens")
    .update({ mint_address: kp.publicKey.toBase58(), vanity_secret_key: Buffer.from(kp.secretKey).toString("base64") })
    .eq("id", id).is("vanity_secret_key", null).select("id");
  if (error) { console.error("[prepare-tx] save mint:", error.message); return NextResponse.json({ error: "Could not save the token address, retry." }, { status: 500 }); }
  if (!data?.length) return NextResponse.json({ error: "This launch is already being prepared, retry in a few seconds." }, { status: 409 });
  return null;
}

/** Limite les adresses réservées sans frais payés : sinon on vidait la réserve DoGE / PEPE / CLT sans rien payer. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tooManyReserved(admin: any, creator: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await admin.from("launchpad_tokens").select("id", { count: "exact", head: true })
    .eq("creator_wallet", creator).eq("status", "pending").is("fee_paid_at", null).not("vanity_secret_key", "is", null).gte("created_at", since);
  return (count ?? 0) >= 3;
}

export async function POST(req: Request, { params }: RouteParams) {
  const { id } = await params;

  try {
    const sess = await requireWallet();
    if ("error" in sess) return sess.error;
    const body = await req.json() as { walletAddress?: string };
    if (!body.walletAddress || body.walletAddress !== sess.wallet) {
      return NextResponse.json({ error: "walletAddress is required" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data: token, error } = await admin
      .from("launchpad_tokens")
      .select(
        "id,creator_wallet,status,name,ticker,description,logo_url,website,twitter,telegram," +
        "supply,first_buy_amount,is_scheduled,mint_address,vanity_secret_key,metadata_uri," +
        "tx_base64,tx_prepared_at,stock_symbol,dbc_config_secret,dbc_config_address,sol_fee_tier,quote_asset"
      )
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

    // Lancements xStock coupés : un token xStock resté en attente repart en lancement simple (paire SOL).
    // Les frais déjà payés restent enregistrés (fee_paid_at), la même adresse de token est gardée.
    if (token.stock_symbol && !XSTOCK_LAUNCH_ENABLED) {
      const { error: convErr } = await admin.from("launchpad_tokens").update({
        stock_symbol: null, quote_asset: null, dbc_config_address: null, dbc_config_secret: null,
        tx_base64: null, tx_prepared_at: null,
      }).eq("id", id).eq("status", "pending");
      if (convErr) {
        console.error("[prepare-tx] xStock to SOL conversion failed:", convErr);
        return NextResponse.json({ error: "Could not switch this launch to SOL, retry." }, { status: 500 });
      }
      Object.assign(token, { stock_symbol: null, quote_asset: null, dbc_config_address: null, dbc_config_secret: null, tx_base64: null, tx_prepared_at: null });
    }

    const isXStock = Boolean(token.stock_symbol);
    // TX A ne contient QUE les frais de la plateforme (SOL et xStock). Une fois payés (vérifiés sur la chaîne
    // par record-fee-tx), on ne la redemande plus aux essais suivants.
    let feeAlreadyPaid = false;
    {
      // Lecture à part : si la colonne n'existe pas encore, on garde l'ancien comportement au lieu de casser le lancement.
      try {
        const { data: f } = await admin.from("launchpad_tokens").select("fee_paid_at").eq("id", id).maybeSingle();
        feeAlreadyPaid = Boolean(f?.fee_paid_at);
      } catch { /* colonne absente */ }
    }

    // ── Mint keypair ─────────────────────────────────────────────────────────
    let mintKeypair: Keypair;
    if (token.vanity_secret_key) {
      const secretBytes = Uint8Array.from(Buffer.from(token.vanity_secret_key as string, "base64"));
      if (secretBytes.length !== 64) {
        return NextResponse.json(
          { error: "Keypair corrompu. Supprime ce token et relance la création." },
          { status: 422 }
        );
      }
      mintKeypair = Keypair.fromSecretKey(secretBytes);
    } else if (isDogeQuote(token.quote_asset as string | null)) {
      // DSOL-20 (paire DOGE) : adresse commençant par « DoGE », prise dans la réserve de clés pré-générées
      if (!dogeLaunchEnabled()) return NextResponse.json({ error: "DOGE launches are not available yet" }, { status: 503 });
      if (await tooManyReserved(admin, token.creator_wallet as string)) return NextResponse.json({ error: "Too many unfinished launches. Finish or delete one first." }, { status: 429 });
      const { data: claimed, error: claimErr } = await admin.rpc("claim_vanity_keypair_label", { p_token_id: id, p_label: DSOL_PREFIX });
      const row = (Array.isArray(claimed) ? claimed[0] : claimed) as { pub_key?: string; sec_key?: string } | null;
      // Plus de repli silencieux vers une adresse « om » : le lancement DoGE promet une adresse DoGE
      if (claimErr) { console.error("[prepare-tx] claim DoGE:", claimErr.message); return NextResponse.json({ error: "Could not reserve a DoGE address, retry in a moment." }, { status: 503 }); }
      if (!row?.sec_key) return NextResponse.json({ error: "No DoGE address left right now. Try again later." }, { status: 503 });
      mintKeypair = Keypair.fromSecretKey(bs58.decode(row.sec_key));
      if (mintKeypair.publicKey.toBase58() !== row.pub_key || !row.pub_key!.startsWith(DSOL_PREFIX)) {
        return NextResponse.json({ error: "Invalid DoGE address in the pool" }, { status: 500 });
      }
      const saved = await saveMint(admin, id, mintKeypair);
      if (saved) return saved;
    } else if (pairQuoteByMint(token.quote_asset as string | null)) {
      // Paire PEPE ou CLT : adresse finissant par « PEPE » ou commençant par « CLT », prise dans la réserve de clés pré-générées
      const pq = pairQuoteByMint(token.quote_asset as string | null)!;
      if (!pairLaunchEnabled(pq.key)) return NextResponse.json({ error: `${pq.symbol} launches are not available yet` }, { status: 503 });
      if (await tooManyReserved(admin, token.creator_wallet as string)) return NextResponse.json({ error: "Too many unfinished launches. Finish or delete one first." }, { status: 429 });
      const { data: claimed, error: claimErr } = await admin.rpc("claim_vanity_keypair_label", { p_token_id: id, p_label: pq.prefix });
      const row = (Array.isArray(claimed) ? claimed[0] : claimed) as { pub_key?: string; sec_key?: string } | null;
      // Plus de repli silencieux vers une adresse « om » : une paire PEPE ou CLT promet son adresse
      if (claimErr) { console.error(`[prepare-tx] claim ${pq.prefix}:`, claimErr.message); return NextResponse.json({ error: `Could not reserve a ${pq.prefix} address, retry in a moment.` }, { status: 503 }); }
      if (!row?.sec_key) return NextResponse.json({ error: `No ${pq.prefix} address left right now. Try again later.` }, { status: 503 });
      mintKeypair = Keypair.fromSecretKey(bs58.decode(row.sec_key));
      if (mintKeypair.publicKey.toBase58() !== row.pub_key || !hasPairMark(pq, row.pub_key!)) {
        return NextResponse.json({ error: `Invalid ${pq.prefix} address in the pool` }, { status: 500 });
      }
      const saved = await saveMint(admin, id, mintKeypair);
      if (saved) return saved;
    } else {
      // L'adresse du token se termine toujours par « om » (générée à la volée)
      try {
        mintKeypair = await generateOmKeypair();
      } catch {
        return NextResponse.json({ error: "Génération de l'adresse trop longue, réessaie." }, { status: 503 });
      }
      const saved = await saveMint(admin, id, mintKeypair);
      if (saved) return saved;
    }

    // Paire DOGE, PEPE ou CLT avec premier achat : le créateur doit avoir assez de cette monnaie,
    // sinon la transaction échouerait sur la chaîne. On le dit avant la signature.
    {
      const pq = pairQuoteByMint(token.quote_asset as string | null);
      const fb = Number(token.first_buy_amount ?? 0);
      if (pq && fb > 0 && process.env.SOLANA_RPC_URL) {
        try {
          const conn = solanaConnection();
          const accs = await conn.getParsedTokenAccountsByOwner(new PublicKey(token.creator_wallet as string), { mint: new PublicKey(pq.mint) });
          const have = accs.value.reduce((n, a) => n + Number(a.account.data.parsed?.info?.tokenAmount?.uiAmount ?? 0), 0);
          if (have < fb) {
            return NextResponse.json({
              error: `Your first buy is ${fb.toLocaleString("en-US")} ${pq.symbol} but your wallet has ${have.toLocaleString("en-US")} ${pq.symbol}. Add ${pq.symbol} to your wallet or lower the first buy.`,
              code: "quote_balance",
            }, { status: 400 });
          }
        } catch (e) { console.warn("[prepare-tx] quote balance check failed:", e); }
      }
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
      stockSymbol:   (token.stock_symbol as string | null) ?? null,
      feeTier:       (token.sol_fee_tier === "low" ? "low" : "standard") as "low" | "standard",
      quote:         (isDogeQuote(token.quote_asset as string | null) ? "doge" : pairQuoteByMint(token.quote_asset as string | null)?.key ?? "sol") as "sol" | PairQuote,
    };

    // ── Déjà lancé ? La mint n'existe sur la chaîne qu'une fois la pool créée ────────
    // Dans ce cas on active le token au lieu de renvoyer une création de pool vouée à l'échec.
    if (token.mint_address && process.env.SOLANA_RPC_URL) {
      try {
        const conn = solanaConnection();
        const mintInfo = await conn.getAccountInfo(new PublicKey(token.mint_address as string));
        if (mintInfo !== null) {
          const r = await recoverPendingToken(admin, { id, ...token } as PendingToken);
          if ("pool" in r) {
            return NextResponse.json({ alreadyLaunched: true, mintAddress: token.mint_address, poolAddress: r.pool });
          }
          return NextResponse.json({ error: RECOVER_MESSAGES[r.reason], reason: r.reason }, { status: 409 });
        }
      } catch (e) {
        // RPC saturé (429) ou injoignable : on ne sait pas si le token est déjà lancé. Construire une nouvelle
        // création de pool échouerait de toute façon (même RPC) et pourrait faire signer pour rien : on demande d'attendre.
        console.warn("[prepare-tx] on-chain mint check failed:", e);
        if (/429|Too Many Requests|rate limit/i.test(String((e as Error)?.message ?? e))) {
          return NextResponse.json({ error: "The Solana network is busy right now. Wait a minute, then tap Retry." }, { status: 503 });
        }
      }
    }

    // ── xStock: check if DBC config already on-chain (retry where TX B landed) ─
    if (isXStock && token.dbc_config_address) {
      try {
        const rpc = process.env.SOLANA_RPC_URL;
        if (rpc) {
          const conn = solanaConnection();
          const configInfo = await conn.getAccountInfo(new PublicKey(token.dbc_config_address as string));
          if (configInfo !== null) {
            console.log("[prepare-tx xStock] config already on-chain — returning TX C only");

            // Rebuild TX C only from fresh DB config secret (mintKeypair already known)
            const configSecretB64 = token.dbc_config_secret as string | null;
            if (!configSecretB64) {
              console.error("[prepare-tx xStock] dbc_config_secret missing — cannot rebuild TX C");
              return NextResponse.json(
                { error: "DBC config secret missing in DB — cannot rebuild pool transaction. Contact support." },
                { status: 500 }
              );
            }
            const configKeypairOverride = Keypair.fromSecretKey(
              Uint8Array.from(Buffer.from(configSecretB64, "base64"))
            );

            const { txCBase64 } = await buildStockPairedTransactions(dbcParams, configKeypairOverride);

            // Cache the fresh TX C
            await admin.from("launchpad_tokens")
              .update({
                tx_base64:      JSON.stringify({ a: null, b: null, c: txCBase64 }),
                tx_prepared_at: new Date().toISOString(),
              })
              .eq("id", id);

            return NextResponse.json({
              txABase64:     null,
              txBBase64:     null,
              txCBase64,
              mintAddress:   mintKeypair.publicKey.toBase58(),
              configAddress: token.dbc_config_address,
            });
          }
        }
      } catch (e) {
        console.warn("[prepare-tx xStock] config on-chain check failed:", e);
      }
    }

    // ── Cache check (only when not yet on-chain) ──────────────────────────────
    const cachedAt   = token.tx_prepared_at ? new Date(token.tx_prepared_at as string).getTime() : 0;
    const cacheAgeMs = Date.now() - cachedAt;
    if (token.tx_base64 && cacheAgeMs < 45_000) {
      try {
        const parsed = JSON.parse(token.tx_base64 as string) as {
          a?: string | null;
          b?: string | null;
          c?: string | null;
        };
        if (parsed.a && parsed.b) {
          return NextResponse.json({
            txABase64:    feeAlreadyPaid ? null : parsed.a,
            txBBase64:    parsed.b,
            txCBase64:    parsed.c ?? undefined,
            mintAddress:  token.mint_address,
            ...(token.dbc_config_address ? { configAddress: token.dbc_config_address } : {}),
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
    const result = await buildSplitPoolTransactions(dbcParams);
    const { txABase64, txBBase64, mintAddress } = result;
    const txCBase64          = result.txCBase64;
    const configAddress      = result.configAddress;
    const configKeypairSecret = result.configKeypairSecret;

    // Persist to DB
    const updatePayload: Record<string, string | null> = {
      metadata_uri:   metadataUri,
      tx_base64:      JSON.stringify({ a: txABase64, b: txBBase64, c: txCBase64 ?? null }),
      tx_prepared_at: new Date().toISOString(),
    };
    if (configAddress)       updatePayload.dbc_config_address = configAddress;
    if (configKeypairSecret) updatePayload.dbc_config_secret  = configKeypairSecret;

    await admin.from("launchpad_tokens").update(updatePayload).eq("id", id);

    return NextResponse.json({
      txABase64: feeAlreadyPaid ? null : txABase64,
      txBBase64,
      ...(txCBase64    ? { txCBase64 }    : {}),
      mintAddress,
      ...(configAddress ? { configAddress } : {}),
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("prepare-tx error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
