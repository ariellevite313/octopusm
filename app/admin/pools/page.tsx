import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { MutuelMarketRow } from "@/lib/supabase/types";
import { AdminPoolsClient } from "@/components/admin/admin-pools-client";

export const revalidate = 0;

async function getPools(status: string): Promise<MutuelMarketRow[]> {
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("mutuel_markets")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false });
  return (data ?? []).map((m: MutuelMarketRow) => ({
    ...m,
    options: typeof m.options === "string" ? JSON.parse(m.options) : m.options,
  }));
}

export default async function AdminPoolsPage() {
  // Guard: must be admin
  const supabase = await createClient();
  const { data: isAdmin } = await (supabase as any).rpc("is_admin");
  if (!isAdmin) redirect("/");

  const [pending, active, closed, resolved, rejected, cancelled] = await Promise.all([
    getPools("pending"),
    getPools("active"),
    getPools("closed"),
    getPools("resolved"),
    getPools("rejected"),
    getPools("cancelled"),
  ]);

  return (
    <AdminPoolsClient
      initialPending={pending}
      initialActive={active}
      initialClosed={closed}
      initialResolved={resolved}
      initialRejected={rejected}
      initialCancelled={cancelled}
    />
  );
}
