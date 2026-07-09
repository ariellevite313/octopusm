import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    // Must be authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      tokenName,
      symbol,
      description,
      mintAddress,
      logoName,
      whitepaperName,
      projectXUrl,
      projectTelegramUrl,
      projectDiscordUrl,
      developerWallets,
      walletAddress,
      launchOption,
      feeAmount,
      initialBuyEnabled,
      initialBuyPercent,
    } = body;

    if (!tokenName || !symbol || !mintAddress || !walletAddress) {
      return NextResponse.json({ error: "Required fields missing" }, { status: 400 });
    }

    // Insert into token_launches table (create SQL below if it doesn't exist)
    const { error } = await (supabase as any).from("token_launches").insert({
      user_id: user.id,
      wallet_address: walletAddress,
      token_name: tokenName,
      symbol,
      description: description ?? null,
      mint_address: mintAddress,
      logo_name: logoName ?? null,
      whitepaper_name: whitepaperName ?? null,
      project_x_url: projectXUrl ?? null,
      project_telegram_url: projectTelegramUrl ?? null,
      project_discord_url: projectDiscordUrl ?? null,
      developer_wallets: developerWallets ?? [],
      launch_option: launchOption,
      fee_amount_sol: feeAmount,
      initial_buy_enabled: initialBuyEnabled ?? true,
      initial_buy_percent: initialBuyPercent ?? 1,
      status: "pending",
    });

    if (error) {
      console.error("[launch/submit]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[launch/submit] unexpected error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
