import type { Snapshot } from "./price-snapshots";

/** Lit les relevés de prix d'un token (par mint ou par id) sur les 30 derniers jours. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchSnapshots(admin: any, by: { mint?: string | null; tokenId?: string | null }, limit = 1500): Promise<Snapshot[]> {
  try {
    let id = by.tokenId ?? null;
    if (!id && by.mint) {
      const { data } = await admin.from("launchpad_tokens").select("id").eq("mint_address", by.mint).maybeSingle();
      id = data?.id ?? null;
    }
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return [];
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data } = await admin
      .from("token_price_snapshots")
      .select("price_usd, created_at")
      .eq("token_id", id)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(limit);
    return ((data ?? []) as { price_usd: number | string; created_at: string }[]).map((r) => ({
      t: Math.floor(new Date(r.created_at).getTime() / 1000),
      p: Number(r.price_usd),
    }));
  } catch {
    return [];
  }
}
