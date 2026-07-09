import { createClient } from "@/lib/supabase/client";

export interface WalletProfile {
  username: string | null;
  display_name: string | null;
  avatar_src: string | null;
  twitter_handle: string | null;
}

export interface PlatformBalances {
  usdc: number;   // gains paris + commissions USDC
  clt: number;    // gains paris + commissions CLT (raw units)
  octo: number;   // points OCTO
}

export async function getWalletProfile(address: string): Promise<WalletProfile | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("wallets")
    .select("username, display_name, avatar_src, twitter_handle")
    .eq("address", address)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any) ?? null;
}

export async function updateWalletProfile(
  address: string,
  updates: { username?: string; display_name?: string; twitter_handle?: string }
): Promise<{ error?: string }> {
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("wallets")
    .update(updates)
    .eq("address", address);
  return error ? { error: (error as { message: string }).message } : {};
}

export async function uploadAvatar(
  file: File,
  walletAddress: string
): Promise<{ url: string } | { error: string }> {
  const supabase = createClient();
  const ext = file.name.split(".").pop() ?? "png";
  const path = `${walletAddress}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) return { error: uploadError.message };

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const url = `${data.publicUrl}?t=${Date.now()}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (supabase as any)
    .from("wallets")
    .update({ avatar_src: url })
    .eq("address", walletAddress);

  if (updateError) return { error: (updateError as { message: string }).message };
  return { url };
}

export async function getOctoBalance(walletAddress: string): Promise<number> {
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("octo_transactions")
    .select("amount")
    .eq("wallet_address", walletAddress);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).reduce((sum: number, row: any) => sum + (row.amount ?? 0), 0);
}

/**
 * Totaux de la plateforme :
 *  - USDC : gains des paris gagnés (net_reward) + commissions de parrainage
 *  - CLT  : gains des paris gagnés (net_reward) + commissions de parrainage (raw units)
 *  - OCTO : somme des octo_transactions
 */
export async function getPlatformBalances(walletAddress: string): Promise<PlatformBalances> {
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const [betsRes, commissionsRes, octoRes] = await Promise.all([
    // Gains des paris (won / claimed / paid)
    db
      .from("prediction_history")
      .select("token, net_reward, result_status")
      .eq("wallet_address", walletAddress)
      .in("result_status", ["win", "claimed", "paid"]),

    // Commissions de parrainage
    db
      .from("referral_commissions")
      .select("amount_usdc, amount_clt")
      .eq("referrer_wallet", walletAddress),

    // Points OCTO
    db
      .from("octo_transactions")
      .select("amount")
      .eq("wallet_address", walletAddress),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bets: any[] = betsRes.data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const commissions: any[] = commissionsRes.data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const octoTxns: any[] = octoRes.data ?? [];

  const betsUsdc = bets
    .filter((b) => b.token === "usdc")
    .reduce((s: number, b: any) => s + (b.net_reward ?? 0), 0);

  const betsClt = bets
    .filter((b) => b.token === "clt" || b.token === "clawdtrust")
    .reduce((s: number, b: any) => s + (b.net_reward ?? 0), 0);

  const commUsdc = commissions.reduce((s: number, r: any) => s + (r.amount_usdc ?? 0), 0);
  const commClt  = commissions.reduce((s: number, r: any) => s + (r.amount_clt ?? 0), 0);

  const octo = octoTxns.reduce((s: number, r: any) => s + (r.amount ?? 0), 0);

  return {
    usdc: betsUsdc + commUsdc,
    clt:  betsClt  + commClt,
    octo,
  };
}
