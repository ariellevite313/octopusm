import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

// Minimums: 2 USDC, 500K CLT
const MIN: Record<string, number> = { usdc: 2, clawdtrust: 500_000 };

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await (supabase as any).auth.getUser();
  const wallet: string | null = user?.user_metadata?.wallet_address ?? null;
  if (!wallet) return NextResponse.json({ withdrawals: [] });

  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from("withdrawal_requests")
    .select("*")
    .eq("wallet_address", wallet)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ withdrawals: data ?? [] });
}

export async function POST(req: Request) {
  // Auth
  const supabase = await createClient();
  const { data: { user } } = await (supabase as any).auth.getUser();
  const wallet: string | null = user?.user_metadata?.wallet_address ?? null;
  if (!wallet) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Parse body
  let body: { token: string; amount: number };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { token, amount } = body;

  // Validate token
  if (!["usdc", "clawdtrust"].includes(token))
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  // Validate amount
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0)
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });

  const min = MIN[token];
  if (parsed < min)
    return NextResponse.json(
      { error: `Minimum withdrawal is ${token === "usdc" ? `$${min} USDC` : `${(min / 1_000_000).toFixed(1)}M CLT`}` },
      { status: 400 }
    );

  // Check for existing pending request for the same token (one at a time)
  const admin = createAdminClient() as any;
  const { data: existing } = await admin
    .from("withdrawal_requests")
    .select("id")
    .eq("wallet_address", wallet)
    .eq("token", token)
    .eq("status", "pending")
    .limit(1);

  if (existing && existing.length > 0)
    return NextResponse.json(
      { error: "You already have a pending withdrawal request for this token. Please wait for it to be processed." },
      { status: 409 }
    );

  // Insert
  const { error } = await admin.from("withdrawal_requests").insert({
    wallet_address: wallet,
    token,
    amount: parsed,
    status: "pending",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
