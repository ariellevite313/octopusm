import { createClient } from "@/lib/supabase/server";
import { MutuelMarketRow, MutuelOption } from "@/lib/supabase/types";
import { PoolsClient } from "@/components/pools/pools-client";

export const revalidate = 30;

async function getActivePools(): Promise<MutuelMarketRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createClient() as any;
  const { data, error } = await supabase
    .from("mutuel_markets")
    .select("*")
    .in("status", ["active", "closed", "resolved"])
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return [];
  return (data ?? []).map((m: MutuelMarketRow) => ({
    ...m,
    options: typeof m.options === "string" ? JSON.parse(m.options) : m.options,
  }));
}

export default async function PoolsPage() {
  const markets = await getActivePools();
  return <PoolsClient markets={markets} />;
}
