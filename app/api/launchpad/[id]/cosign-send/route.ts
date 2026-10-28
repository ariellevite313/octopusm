/**
 * POST /api/launchpad/[id]/cosign-send
 *
 * "Wallet first" signing for the Meteora DBC pool transaction (TX B, SOL path).
 *
 * Phantom flags transactions that arrive already signed by another party
 * ("This dApp could be malicious"). So the client now:
 *   1. strips the server's pre-signature from TX B,
 *   2. lets the wallet sign FIRST (signTransaction, not signAndSend),
 *   3. posts the wallet-signed tx here.
 * This route then adds the mint keypair signature (kept server-side) and
 * broadcasts the fully-signed transaction.
 *
 * Body: { signedTransactionBase64: string, walletAddress: string }
 * Response: { signature: string }
 */
import { NextResponse } from "next/server";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { getPlatformWallet } from "@/lib/solana/dbc";

// Programmes que certains wallets (Phantom : Lighthouse) ajoutent eux-mêmes comme garde-fous.
const WALLET_GUARD_PROGRAMS = new Set(["L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95"]);

/** Les instructions (hors garde-fous du wallet) doivent être exactement celles que le serveur a préparées. */
function sameInstructions(posted: Transaction, prepared: Transaction): boolean {
  const norm = (tx: Transaction, skipGuards: boolean) =>
    tx.instructions
      .filter((ix) => !(skipGuards && WALLET_GUARD_PROGRAMS.has(ix.programId.toBase58())))
      .map((ix) => JSON.stringify([
        ix.programId.toBase58(),
        Buffer.from(ix.data).toString("base64"),
        ix.keys.map((k) => [k.pubkey.toBase58(), k.isSigner, k.isWritable]),
      ]));
  const a = norm(posted, true), b = norm(prepared, false);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  const { id } = await params;
  try {
    const sess = await requireWallet();
    if ("error" in sess) return sess.error;
    const body = await req.json() as { signedTransactionBase64?: string; walletAddress?: string };
    if (!body.signedTransactionBase64 || !body.walletAddress) {
      return NextResponse.json({ error: "signedTransactionBase64 and walletAddress are required" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data: token } = await admin
      .from("launchpad_tokens")
      .select("creator_wallet, status, mint_address, vanity_secret_key, stock_symbol, dbc_config_secret, tx_base64")
      .eq("id", id)
      .maybeSingle();

    if (!token) return NextResponse.json({ error: "Token not found" }, { status: 404 });
    if (token.creator_wallet !== body.walletAddress || body.walletAddress !== sess.wallet) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    if (token.status !== "pending") return NextResponse.json({ error: "Token is not pending" }, { status: 409 });
    if (!token.vanity_secret_key) return NextResponse.json({ error: "Mint key missing — click Retry" }, { status: 409 });

    const tx = Transaction.from(Buffer.from(body.signedTransactionBase64, "base64"));

    // 1. The creator's wallet must have signed already.
    const creator = new PublicKey(body.walletAddress);
    const creatorSig = tx.signatures.find((s) => s.publicKey.equals(creator));
    if (!creatorSig?.signature) {
      return NextResponse.json({ error: "Wallet signature missing" }, { status: 400 });
    }

    // 2. Add the mint signature if the mint is a required signer.
    const mintKeypair = Keypair.fromSecretKey(Uint8Array.from(Buffer.from(token.vanity_secret_key as string, "base64")));
    if (token.mint_address && mintKeypair.publicKey.toBase58() !== token.mint_address) {
      return NextResponse.json({ error: "Mint key mismatch" }, { status: 409 });
    }
    if (token.stock_symbol) {
      // xStock : le serveur ne signe QUE si la transaction reçue est bien l'une de celles qu'il a préparées
      // (la signature de la plateforme ne doit jamais servir sur une transaction arbitraire).
      let cached: { b?: string | null; c?: string | null } = {};
      try { cached = JSON.parse((token.tx_base64 as string) ?? "{}"); } catch { /* ignore */ }
      const prepB = cached.b ? Transaction.from(Buffer.from(cached.b, "base64")) : null;
      const prepC = cached.c ? Transaction.from(Buffer.from(cached.c, "base64")) : null;

      if (prepB && sameInstructions(tx, prepB)) {
        // TX B (createConfig) : signatures plateforme + clé de config
        const cfgSecret = token.dbc_config_secret as string | null;
        if (!cfgSecret) return NextResponse.json({ error: "Config key missing — click Retry" }, { status: 409 });
        const configKeypair = Keypair.fromSecretKey(Uint8Array.from(Buffer.from(cfgSecret, "base64")));
        const platform = getPlatformWallet();
        for (const kp of [platform, configKeypair]) {
          if (tx.signatures.some((sg) => sg.publicKey.equals(kp.publicKey))) tx.partialSign(kp);
        }
      } else if (prepC && sameInstructions(tx, prepC)) {
        // TX C (createPool) : signature de la mint
        if (tx.signatures.some((sg) => sg.publicKey.equals(mintKeypair.publicKey))) tx.partialSign(mintKeypair);
      } else {
        return NextResponse.json({ error: "Transaction does not match the prepared one — click Retry" }, { status: 400 });
      }
    } else {
      // Token classique : la clé de la mint ne signe que la transaction B préparée par le serveur.
      let cached: { b?: string | null } = {};
      try { cached = JSON.parse((token.tx_base64 as string) ?? "{}"); } catch { /* ignore */ }
      const prepB = cached.b ? Transaction.from(Buffer.from(cached.b, "base64")) : null;
      if (!prepB || !sameInstructions(tx, prepB)) {
        return NextResponse.json({ error: "Transaction does not match the prepared one — click Retry" }, { status: 400 });
      }
      if (tx.signatures.some((s) => s.publicKey.equals(mintKeypair.publicKey))) tx.partialSign(mintKeypair);
    }

    // 3. Broadcast — serialize() verifies every required signature is present & valid.
    const rpc = process.env.SOLANA_RPC_URL;
    if (!rpc) throw new Error("SOLANA_RPC_URL is not set");
    const connection = new Connection(rpc, "confirmed");
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: true,
      preflightCommitment: "confirmed",
      maxRetries: 3,
    });

    return NextResponse.json({ signature });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[cosign-send] error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
