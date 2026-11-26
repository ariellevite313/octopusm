/** GET /api/crown : les porteurs de couronne (top 5 des gains sur OM) et si le wallet connecté en fait partie. */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { CROWN_BOOST_DISCOUNT, CROWN_SWAP_FEE_BPS, crownWallets, hasCrown } from "@/lib/top-earner";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = createAdminClient();
  const [wallets, me] = await Promise.all([crownWallets(db).catch(() => [] as string[]), getWalletAddress().catch(() => null)]);
  return NextResponse.json({ wallets, me: await hasCrown(db, me), boostDiscount: CROWN_BOOST_DISCOUNT, swapFeeBps: CROWN_SWAP_FEE_BPS }, { headers: { "Cache-Control": "no-store" } });
}
