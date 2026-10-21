/**
 * Holders d'un token : liste complète depuis notre base pour Arc (table arc_holdings, tenue à jour par le cron),
 * noms et photos des profils OMdotfun pour les deux chaînes.
 */
import { getProfiles } from "@/lib/profiles";

export const TOP_HOLDERS = 100;

export type HolderRow = { rank: number; owner: string; amount: number; pct: number; isProgram: boolean; name: string | null; avatar: string | null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Tous les soldes > 0 d'un token Arc (balance_raw en unités 18 décimales). null si le token n'est pas indexé. */
export async function arcBalances(db: Db, tokenAddress: string): Promise<{ owner: string; raw: bigint }[] | null> {
  const { data: tok } = await db.from("launchpad_tokens").select("id").eq("chain", "arc").ilike("mint_address", tokenAddress).maybeSingle();
  if (!tok) return null;
  const out: { owner: string; raw: bigint }[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await db.from("arc_holdings").select("wallet, balance_raw").eq("token_id", tok.id).range(from, from + 999);
    if (error) return out.length ? out : null;
    for (const r of (data ?? []) as { wallet: string; balance_raw: string | number }[]) {
      try {
        const raw = BigInt(String(r.balance_raw).split(".")[0]);
        if (raw > 0n) out.push({ owner: r.wallet.toLowerCase(), raw });
      } catch { /* valeur illisible */ }
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Ajoute le nom et la photo du profil OMdotfun aux holders qui en ont un. */
export async function withProfiles(db: Db, rows: Omit<HolderRow, "name" | "avatar">[]): Promise<HolderRow[]> {
  const profiles = await getProfiles(db, rows.map((r) => r.owner)).catch(() => new Map());
  return rows.map((r) => {
    const p = profiles.get(r.owner);
    return { ...r, name: p?.name ?? null, avatar: p?.avatar_src ?? null };
  });
}
