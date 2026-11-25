import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { AdminReportsClient, type ReportedPost } from "@/components/admin/admin-reports-client";
import { AdminDiscoverReports, type ReportedApp } from "@/components/admin/admin-discover-reports";

export const metadata: Metadata = { title: "Reports — Admin" };
export const revalidate = 0;

export default async function AdminReportsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: reports } = await admin
    .from("post_reports").select("post_id, reason, created_at").eq("status", "open").order("created_at", { ascending: false }).limit(500);
  const byPost = new Map<string, { count: number; reasons: string[]; last: string }>();
  for (const r of (reports ?? []) as { post_id: string; reason: string | null; created_at: string }[]) {
    const e = byPost.get(r.post_id) ?? { count: 0, reasons: [], last: r.created_at };
    e.count++;
    if (r.reason && e.reasons.length < 3) e.reasons.push(r.reason);
    byPost.set(r.post_id, e);
  }
  const ids = [...byPost.keys()];
  const { data: posts } = ids.length
    ? await admin.from("posts").select("id, author, body, images, hidden, created_at").in("id", ids)
    : { data: [] };
  const items: ReportedPost[] = ((posts ?? []) as Omit<ReportedPost, "reports" | "reasons">[])
    .map((p) => ({ ...p, reports: byPost.get(p.id)!.count, reasons: byPost.get(p.id)!.reasons }))
    .sort((a, b) => b.reports - a.reports);
  // Projets Discover signalés (table créée par la migration 20261214 ; vide avant)
  const appItems: ReportedApp[] = [];
  const { data: dr, error: drErr } = await admin.from("discover_reports").select("app_id, reason, note").eq("status", "open").limit(1000);
  if (!drErr && dr?.length) {
    const by = new Map<string, { reports: number; reasons: Record<string, number>; notes: string[] }>();
    for (const r of dr as { app_id: string; reason: string; note: string | null }[]) {
      const e = by.get(r.app_id) ?? { reports: 0, reasons: {}, notes: [] };
      e.reports++; e.reasons[r.reason] = (e.reasons[r.reason] ?? 0) + 1;
      if (r.note && e.notes.length < 3) e.notes.push(r.note);
      by.set(r.app_id, e);
    }
    const { data: apps } = await admin.from("discover_apps").select("id, name, site_url, status").in("id", [...by.keys()]);
    for (const a of (apps ?? []) as { id: string; name: string; site_url: string; status: string }[]) appItems.push({ ...a, ...by.get(a.id)! });
    appItems.sort((x, y) => y.reports - x.reports);
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Reported posts</h1>
        <p className="mt-1 text-sm text-muted-foreground">{items.length} post{items.length !== 1 ? "s" : ""} to review</p>
      </div>
      <AdminReportsClient items={items} />
      <div>
        <h2 className="text-lg font-bold">Reported Discover projects</h2>
        <p className="mt-1 text-sm text-muted-foreground">Hidden automatically at 5 reports. Hide or keep online.</p>
      </div>
      <AdminDiscoverReports items={appItems} />
    </div>
  );
}
