import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { CATEGORY_SLUGS } from "@/lib/categories";
import { Connection } from "@solana/web3.js";

export const revalidate = 0;

// ── Tx verification ───────────────────────────────────────────────────────────

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

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from("mutuel_markets")
    .select("id, slug, title, description, cover_image_src, options, category, status, bet_token, creation_fee_token, creation_fee_amount, creator_wallet, betting_closes_at, total_pool_usdc, total_pool_clt, bet_count, winning_option_id, created_at")
    .in("status", ["pending", "active", "closed"])
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const userClient = await createClient() as any;
  const { data: { user } } = await userClient.auth.getUser();
  const wallet: string | null = user?.user_metadata?.wallet_address ?? null;
  if (!wallet) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const {
    title, description, cover_image_src, options,
    category, bet_token, betting_closes_at,
    creation_fee_token, creation_tx,
  } = body;

  // ── Validate creation payment ─────────────────────────────────────────────
  if (!creation_tx || typeof creation_tx !== "string") {
    return NextResponse.json({ error: "Creation fee transaction required" }, { status: 400 });
  }
  if (!["usdc", "clawdtrust"].includes(creation_fee_token)) {
    return NextResponse.json({ error: "Invalid creation fee token" }, { status: 400 });
  }

  // Verify tx on-chain (memo must contain kind=pool_creation&wallet=xxx)
  const txValid = await verifyCreationTx(creation_tx, wallet);
  if (!txValid) {
    return NextResponse.json({ error: "Creation fee transaction could not be verified." }, { status: 402 });
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

  const closesAtMs = new Date(betting_closes_at).getTime();
  if (!betting_closes_at || isNaN(closesAtMs) || closesAtMs < Date.now() + 60 * 60 * 1000)
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

  const creationFeeAmount = creation_fee_token === "clawdtrust" ? 500_000 : 2;

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
      betting_closes_at,
      status: "pending",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(inserted, { status: 201 });
}
