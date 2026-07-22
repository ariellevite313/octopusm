import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { awardOcto, OCTO_PER_CREATION } from "@/lib/octo";

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

  // Création gratuite — pas de frais ni de transaction on-chain requise
  const admin = createAdminClient() as any;

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

  const safeOptions = options.map((opt: { label: string }, i: number) => ({
    id: `opt_${i}`,
    label: String(opt.label).slice(0, 80).trim(),
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
      category: category ? String(category).slice(0, 50) : "general",
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

  // Award OCTO for creating a pool (fire and forget)
  awardOcto(wallet, OCTO_PER_CREATION, "task", "Pool created").catch(() => {});

  return NextResponse.json(inserted, { status: 201 });
}
