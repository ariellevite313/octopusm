/** Création d'un marché pari mutuel (pool) : paiement des frais vérifié sur la chaîne, champs validés, statut « pending » (revue admin). */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { CATEGORY_SLUGS } from "@/lib/categories";
import { Connection } from "@solana/web3.js";
import { POOL_CREATION_FEE_USDC, POOL_CREATION_FEE_CLT } from "@/lib/market/pool-fee";
import { verifyArcTransfer } from "@/lib/arc-verify";
import { checkSolanaTransfer } from "@/lib/solana/verify-transfer";

async function verifyCreationTx(txSig: string, wallet: string): Promise<boolean> {
  const rpc = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
  const conn = new Connection(rpc, "confirmed");

  // Retry up to 3 times with 1.5s delay (tx may not have propagated yet right after broadcast)
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 1500));
    try {
      const tx = await conn.getParsedTransaction(txSig, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      if (!tx) continue; // not confirmed yet — retry

      const instructions = tx.transaction.message.instructions;
      for (const ix of instructions) {
        // Parsed memo: ix.parsed is the memo string
        if ("parsed" in ix && typeof ix.parsed === "string") {
          if (ix.parsed.includes(`wallet=${wallet}`) && ix.parsed.includes("kind=pool_creation")) {
            return true;
          }
        }
        // Fallback: some RPCs expose memo data in accounts[0] as base64
        if ("data" in ix && typeof (ix as any).data === "string") {
          try {
            const decoded = Buffer.from((ix as any).data, "base64").toString("utf8");
            if (decoded.includes(`wallet=${wallet}`) && decoded.includes("kind=pool_creation")) {
              return true;
            }
          } catch { /* not utf8 */ }
        }
      }
      // Tx found but no matching memo — don't retry
      return false;
    } catch {
      // RPC error — retry
    }
  }
  return false;
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createPoolMarket(wallet: string, body: any): Promise<NextResponse> {
  const {
    title, description, cover_image_src, options,
    category, bet_token, betting_closes_at,
    creation_fee_token, creation_tx, match_key,
  } = body;

  // ── Validate creation payment ─────────────────────────────────────────────
  if (!creation_tx || typeof creation_tx !== "string") {
    return NextResponse.json({ error: "Creation fee transaction required" }, { status: 400 });
  }
  if (!["usdc", "clawdtrust"].includes(creation_fee_token)) {
    return NextResponse.json({ error: "Invalid creation fee token" }, { status: 400 });
  }

  // Verify tx on-chain (memo must contain kind=pool_creation&wallet=xxx)
  const isEvmWallet = /^0x[0-9a-fA-F]{40}$/.test(wallet);
  if (isEvmWallet && creation_fee_token !== "usdc") {
    return NextResponse.json({ error: "Arc wallets pay the creation fee in USDC" }, { status: 400 });
  }
  const txValid = isEvmWallet
    ? (await verifyArcTransfer({ hash: creation_tx, from: wallet, minUsdc: POOL_CREATION_FEE_USDC, memoIncludes: ["kind=pool_creation", `wallet=${wallet}`] })) === "ok"
    : await verifyCreationTx(creation_tx, wallet);
  if (!txValid) {
    return NextResponse.json({ error: "Creation fee transaction could not be verified." }, { status: 402 });
  }
  // Solana : le mémo ne suffit pas, le montant et le destinataire doivent aussi être corrects
  if (!isEvmWallet) {
    const feeAmount = creation_fee_token === "clawdtrust" ? POOL_CREATION_FEE_CLT : POOL_CREATION_FEE_USDC;
    const paid = await checkSolanaTransfer(creation_tx, creation_fee_token, feeAmount);
    if (paid !== "ok") {
      return NextResponse.json({ error: "Creation fee payment could not be verified." }, { status: 402 });
    }
  }

  // Prevent replaying the same tx for multiple markets
  const admin = createAdminClient() as any;
  const { count: txUsed } = await admin
    .from("mutuel_markets")
    .select("id", { count: "exact", head: true })
    .eq("creation_tx", creation_tx);
  if ((txUsed ?? 0) > 0) {
    return NextResponse.json({ error: "This transaction has already been used." }, { status: 409 });
  }

  // ── Validate fields ───────────────────────────────────────────────────────
  if (!title || typeof title !== "string" || title.trim().length < 5)
    return NextResponse.json({ error: "Title must be at least 5 characters" }, { status: 400 });

  if (!Array.isArray(options) || options.length < 2 || options.length > 8)
    return NextResponse.json({ error: "2 to 8 options required" }, { status: 400 });

  for (const opt of options) {
    if (!opt.label || typeof opt.label !== "string" || opt.label.trim().length === 0)
      return NextResponse.json({ error: "All options must have a non-empty label" }, { status: 400 });
  }

  // Pool lié à un match : le match doit exister et ne pas avoir commencé ; les paris se ferment au coup d'envoi
  let matchKey: string | null = null;
  let closesAtIso: string = betting_closes_at;
  if (match_key != null && match_key !== "") {
    if (typeof match_key !== "string" || match_key.length > 200) return NextResponse.json({ error: "Invalid match" }, { status: 400 });
    const { data: m } = await admin.from("live_matches").select("key, kickoff, status").eq("key", match_key).maybeSingle();
    if (!m || m.status !== "scheduled" || new Date(m.kickoff).getTime() < Date.now() + 60 * 60 * 1000) {
      return NextResponse.json({ error: "This match is not available (it must start in more than 1 hour)" }, { status: 400 });
    }
    matchKey = m.key;
    closesAtIso = new Date(m.kickoff).toISOString();
  }
  const closesAtMs = new Date(closesAtIso).getTime();
  if (!closesAtIso || isNaN(closesAtMs) || closesAtMs < Date.now() + 60 * 60 * 1000)
    return NextResponse.json({ error: "Betting close date must be at least 1 hour from now" }, { status: 400 });

  if (!["usdc", "clawdtrust"].includes(bet_token))
    return NextResponse.json({ error: "Invalid bet token" }, { status: 400 });

  const safeCategory = category && CATEGORY_SLUGS.includes(String(category) as typeof CATEGORY_SLUGS[number])
    ? String(category) : "mentions";

  const baseSlug = title.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  const randomSuffix = () =>
    Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map(b => b.toString(16).padStart(2, "0")).join("");
  const slug = `${baseSlug}-${randomSuffix()}`;

  const safeOptions = options.map((opt: { label: string; image_url?: string | null }, i: number) => ({
    id: `opt_${i}`,
    label: String(opt.label).slice(0, 80).trim(),
    ...(opt.image_url ? { image_url: String(opt.image_url).slice(0, 500) } : {}),
  }));

  const creationFeeAmount = creation_fee_token === "clawdtrust" ? POOL_CREATION_FEE_CLT : POOL_CREATION_FEE_USDC;

  const { data: inserted, error } = await admin
    .from("mutuel_markets")
    .insert({
      slug,
      creator_wallet:      wallet,
      title:               title.trim().slice(0, 200),
      description:         description ? String(description).slice(0, 1000) : null,
      cover_image_src:     cover_image_src ? String(cover_image_src).slice(0, 500) : null,
      options:             safeOptions,
      category:            safeCategory,
      creation_fee_token,
      creation_fee_amount: creationFeeAmount,
      creation_tx,
      bet_token,
      betting_closes_at: closesAtIso,
      match_key: matchKey,
      status: "pending",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(inserted, { status: 201 });
}
