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
  _address: string,
  updates: { username?: string; display_name?: string; twitter_handle?: string }
): Promise<{ error?: string }> {
  // Use server-side route to bypass RLS (anon client cannot UPDATE wallets)
  try {
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      return { error: body.error ?? "Failed to update profile" };
    }
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function uploadAvatar(
  file: File,
  _walletAddress: string
): Promise<{ url: string } | { error: string }> {
  // Upload via server route (bypasses RLS) + updates wallets.avatar_src
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/profile/avatar", { method: "POST", body: formData });
  const data = await res.json() as { url?: string; error?: string };
  if (!res.ok || !data.url) return { error: data.error ?? "Upload failed" };

  // Sync avatar_src via profile route (also uses admin client)
  await fetch("/api/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ avatar_src: data.url }),
  });

  return { url: data.url };
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
 * Totaux de la plateforme — délégués à /api/balance (REF-D fix).
 * L'endpoint server-side utilise adminDb pour bypasser RLS sur toutes les tables
 * et inclut tous les types de marchés (prediction, updown, mutuel).
 * Le paramètre walletAddress est ignoré : l'endpoint lit la session côté serveur.
 */
export interface DrawerStats {
  bets_count: number;
  win_count: number;
  win_rate: number;
  referral_count: number;
  referral_octo: number;
  referral_code: string | null;
}

export async function getDrawerStats(): Promise<DrawerStats> {
  const empty: DrawerStats = { bets_count: 0, win_count: 0, win_rate: 0, referral_count: 0, referral_octo: 0, referral_code: null };
  try {
    const res = await fetch("/api/drawer-stats");
    if (!res.ok) return empty;
    return await res.json() as DrawerStats;
  } catch {
    return empty;
  }
}

export async function getPlatformBalances(_walletAddress: string): Promise<PlatformBalances> {
  try {
    const res = await fetch("/api/balance");
    if (!res.ok) return { usdc: 0, clt: 0, octo: 0 };
    const { usdcBalance, cltBalance, octoBalance } = await res.json() as {
      usdcBalance: number;
      cltBalance: number;
      octoBalance: number;
    };
    return { usdc: usdcBalance, clt: cltBalance, octo: octoBalance ?? 0 };
  } catch {
    return { usdc: 0, clt: 0, octo: 0 };
  }
}
