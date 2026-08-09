import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { CATEGORY_SLUGS } from "@/lib/categories";

export const revalidate = 0;

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

export async function POST(req: Request) {
  // Auth check with user client (respects session cookies)
  const userClient = await createClient() as any;
  const { data: { user } } = await userClient.auth.getUser();
  const wallet: string | null = user?.user_metadata?.wallet_address ?? null;
  if (!wallet) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body;

  try { body = await req.json(); }

  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { title, description, cover_image_src, options, category, bet_token, betting_closes_at } = body;

  if (!title || typeof title !== "string" || title.trim().length < 5)
    return NextResponse.json({ error: "Title must be at least 5 characters" }, { status: 400 });

  if (!Array.isArray(options) || options.length < 2 || options.length > 8)
    return NextResponse.json({ error: "2 to 8 options required" }, { status: 400 });

  for (const opt of options) {
    if (!opt.label || typeof opt.label !== "string" || opt.label.trim().length === 0)
      return NextResponse.json({ error: "All options must have a non-empty label" }, { status: 400 });
  }

  // BUG-18 fix: require at least 1 hour from now — prevents pools that close before anyone can bet
  const closesAtMs = new Date(betting_closes_at).getTime();
  if (!betting_closes_at || isNaN(closesAtMs) || closesAtMs < Date.now() + 60 * 60 * 1000)
    return NextResponse.json({ error: "Betting close date must be at least 1 hour from now" }, { status: 400 });

  const allowedTokens = ["usdc", "clawdtrust"];
  if (!allowedTokens.includes(bet_token))
    return NextResponse.json({ error: "Invalid bet token" }, { status: 400 });

  const safeCategory = category && CATEGORY_SLUGS.includes(String(category) as typeof CATEGORY_SLUGS[number]) ? String(category) : "mentions";

  const admin = createAdminClient() as any;

  // ── Daily creation limit ──────────────────────────────────────────────────
  // Free: 2 markets/day. From the 3rd: costs 500 OCTO (anti-spam).
  const FREE_DAILY_LIMIT      = 2;
  const EXTRA_MARKET_COST_OCTO = 500;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count: todayCount } = await admin
    .from("mutuel_markets")
    .select("id", { count: "exact", head: true })
    .eq("creator_wallet", wallet)
    .gte("created_at", todayStart.toISOString());

  if ((todayCount ?? 0) >= FREE_DAILY_LIMIT) {
    // Check OCTO balance
    const { data: txns } = await admin
      .from("octo_transactions")
      .select("amount")
      .eq("wallet_address", wallet);
    const octoBalance = ((txns ?? []) as { amount: number }[])
      .reduce((s, t) => s + Number(t.amount), 0);

    if (octoBalance < EXTRA_MARKET_COST_OCTO) {
      return NextResponse.json({
        error: `Limite journalière atteinte : ${FREE_DAILY_LIMIT} marchés gratuits/jour. La création d'un marché supplémentaire coûte ${EXTRA_MARKET_COST_OCTO} Omeru Inu. Solde actuel : ${Math.floor(octoBalance)} Omeru Inu.`,
        code: "DAILY_LIMIT_INSUFFICIENT_OCTO",
        today_count: todayCount ?? 0,
        octo_balance: Math.floor(octoBalance),
        cost_octo: EXTRA_MARKET_COST_OCTO,
      }, { status: 429 });
    }

    // Deduct OCTO
    await admin.from("octo_transactions").insert({
      wallet_address: wallet,
      amount: -EXTRA_MARKET_COST_OCTO,
      type: "task",
      note: `Frais création marché (${(todayCount ?? 0) + 1}ème aujourd'hui)`,
    });
  }

  const baseSlug = title.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  // Generate a unique slug — suffix with random hex to avoid collisions
  const randomSuffix = () =>
    Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map(b => b.toString(16).padStart(2, "0")).join("");
  const slug = `${baseSlug}-${randomSuffix()}`;

  const safeOptions = options.map((opt: { label: string; image_url?: string | null }, i: number) => ({
    id: `opt_${i}`,
    label: String(opt.label).slice(0, 80).trim(),
    ...(opt.image_url ? { image_url: String(opt.image_url).slice(0, 500) } : {}),
  }));

  // Use admin client to bypass RLS for the insert (auth already verified above)
  const { data: inserted, error } = await admin
    .from("mutuel_markets")
    .insert({
      slug,
      creator_wallet: wallet,
      title: title.trim().slice(0, 200),
      description: description ? String(description).slice(0, 1000) : null,
      cover_image_src: cover_image_src ? String(cover_image_src).slice(0, 500) : null,
      options: safeOptions,
      category: safeCategory,
      creation_fee_token: bet_token,
      creation_fee_amount: 0,
      creation_tx: null,
      bet_token,
      betting_closes_at,
      status: "pending",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(inserted, { status: 201 });
}
