/**
 * GET /api/bags : tokens détenus par le portefeuille connecté (sa chaîne), triés par valeur décroissante.
 * Lecture seule. Mis en cache 30 s par portefeuille.
 */
import { NextResponse } from "next/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { createAdminClient } from "@/lib/supabase/server";
import { arcBags, solanaBags, splitBags, type Bag } from "@/lib/bags";

export const dynamic = "force-dynamic";

const cache = new Map<string, { at: number; v: { chain: "solana" | "arc"; main: Bag[]; small: Bag[]; total: number; change24h: number } }>();

export async function GET(req: Request) {
  const wallet = await getWalletAddress();
  if (!wallet) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  const hit = cache.get(wallet);
  if (hit && !fresh && Date.now() - hit.at < 30_000) return NextResponse.json(hit.v);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const isArc = wallet.startsWith("0x");
  try {
    let bags: Bag[];
    if (isArc) {
      const { data } = await admin
        .from("arc_holdings")
        .select("balance_raw, launchpad_tokens (id, name, ticker, logo_url, mint_address, price_usd)")
        .eq("wallet", wallet.toLowerCase())
        .neq("balance_raw", "0");
      bags = await arcBags(wallet, data ?? []);
    } else {
      bags = await solanaBags(wallet, async (mints) => {
        const out = [];
        for (let i = 0; i < mints.length; i += 200) {
          const { data } = await admin.from("launchpad_tokens").select("id, name, ticker, logo_url, price_usd, mint_address").in("mint_address", mints.slice(i, i + 200));
          out.push(...(data ?? []));
        }
        return out;
      });
    }
    const v = { chain: (isArc ? "arc" : "solana") as "solana" | "arc", ...splitBags(bags) };
    cache.set(wallet, { at: Date.now(), v });
    if (cache.size > 2000) cache.delete(cache.keys().next().value as string);
    return NextResponse.json(v);
  } catch {
    return NextResponse.json({ error: "Could not read the wallet right now" }, { status: 502 });
  }
}
