import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { AdminAction } from "@/components/admin/admin-actions";

export const metadata: Metadata = { title: "Connected apps — Admin" };
export const revalidate = 0;

const short = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`;

export default async function AdminAppsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const [{ data: tokens }, { data: clients }] = await Promise.all([
    admin.from("oauth_tokens").select("id, client_id, wallet, scopes, revoked, created_at, last_used_at, refresh_expires_at").order("created_at", { ascending: false }).limit(300),
    admin.from("oauth_clients").select("client_id, client_name"),
  ]);
  const names = new Map<string, string>(((clients ?? []) as { client_id: string; client_name: string }[]).map((c) => [c.client_id, c.client_name]));
  const rows = (tokens ?? []) as { id: string; client_id: string; wallet: string; scopes: string[]; revoked: boolean; created_at: string; last_used_at: string | null; refresh_expires_at: string }[];
  const active = rows.filter((r) => !r.revoked && new Date(r.refresh_expires_at) > new Date());
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Connected apps</h1>
        <p className="mt-1 text-sm text-muted-foreground">{active.length} active connection{active.length !== 1 ? "s" : ""}. Revoking cuts the app&apos;s access immediately.</p>
      </div>
      <div className="divide-y divide-border rounded-2xl border border-border bg-card">
        {rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">No app connected yet.</p>}
        {rows.map((r) => {
          const live = !r.revoked && new Date(r.refresh_expires_at) > new Date();
          return (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{names.get(r.client_id) ?? r.client_id} <span className="font-normal text-muted-foreground">· {short(r.wallet)}</span></p>
                <p className="text-muted-foreground">{r.scopes.join(", ")} · connected {new Date(r.created_at).toLocaleDateString()} · last used {r.last_used_at ? new Date(r.last_used_at).toLocaleString() : "never"}</p>
              </div>
              {live ? <AdminAction url="/api/admin/apps" body={{ id: r.id }} label="Revoke" danger confirm="Cut this app's access?" /> : <span className="text-muted-foreground">{r.revoked ? "Revoked" : "Expired"}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
