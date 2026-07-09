import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export const revalidate = 0;

export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createClient() as any;
  const { data, error } = await supabase
    .from("mutuel_markets")
    .select("*")
    .in("status", ["active", "closed", "resolved"])
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  // Auth check with user client (respects session cookies)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userClient = await createClient() as any;
  const { data: { user } } = await userClient.auth.getUser();
  const wallet: string | null = user?.user_metadata?.wallet_address ?? null;
  if (!wallet) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const { title, description, options, category, creation_fee_token, creation_tx, betting_closes_at, bet_token } = body;

  if (!title || typeof title !== "string" || title.trim().length < 5)
    return NextResponse.json({ error: "Title must be at least 5 characters" }, { status: 400 });

  if (!Array.isArray(options) || options.length < 2 || options.length > 8)
    return NextResponse.json({ error: "2 to 8 options required" }, { status: 400 });

  for (const opt of options) {
    if (!opt.label || typeof opt.label !== "string" || opt.label.trim().length === 0)
      return NextResponse.json({ error: "All options must have a non-empty label" }, { status: 400 });
  }

  if (!betting_closes_at || new Date(betting_closes_at) <= new Date())
    return NextResponse.json({ error: "Betting close date must be in the future" }, { status: 400 });

  const allowedTokens = ["usdc", "clawdtrust"];
  if (!allowedTokens.includes(creation_fee_token))
    return NextResponse.json({ error: "Invalid creation fee token" }, { status: 400 });
  if (!allowedTokens.includes(bet_token))
    return NextResponse.json({ error: "Invalid bet token" }, { status: 400 });

  const fee_amount = creation_fee_token === "usdc" ? 5 : 500_000;

  const slug = title.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    + "-" + Date.now().toString(36);

  const safeOptions = options.map((opt: { label: string }, i: number) => ({
    id: `opt_${i}`,
    label: String(opt.label).slice(0, 80).trim(),
  }));

  // Use admin client to bypass RLS for the insert (auth already verified above)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: inserted, error } = await admin
    .from("mutuel_markets")
    .insert({
      slug,
      creator_wallet: wallet,
      title: title.trim().slice(0, 200),
      description: description ? String(description).slice(0, 1000) : null,
      options: safeOptions,
      category: category ? String(category).slice(0, 50) : "general",
      creation_fee_token,
      creation_fee_amount: fee_amount,
      creation_tx: creation_tx ? String(creation_tx).slice(0, 120) : null,
      bet_token,
      betting_closes_at,
      status: "pending",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(inserted, { status: 201 });
}
