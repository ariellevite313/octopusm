"use client";

/** Admin : projets Discover signalés (raisons, nombre), masquer ou remettre en ligne. */
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { REPORT_REASON_LABEL } from "@/lib/discover";

export type ReportedApp = { id: string; name: string; site_url: string; status: string; reports: number; reasons: Record<string, number>; notes: string[] };

export function AdminDiscoverReports({ items }: { items: ReportedApp[] }) {
  const [list, setList] = useState(items);
  async function act(id: string, action: "hide" | "restore") {
    const r = await fetch(`/api/admin/discover/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    if (!r.ok) { toast.error("Failed"); return; }
    setList((l) => l.filter((x) => x.id !== id));
    toast.success(action === "hide" ? "Project hidden" : "Project back online");
  }
  if (list.length === 0) return <p className="text-sm text-muted-foreground">No reported project.</p>;
  return (
    <div className="space-y-3">
      {list.map((a) => (
        <div key={a.id} className="rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link href={`/discover/${a.id}`} className="text-[15px] font-bold underline">{a.name}</Link>
            <span className="text-[12px] text-muted-foreground">{a.reports} report{a.reports > 1 ? "s" : ""} · {a.status}</span>
          </div>
          <a href={a.site_url} target="_blank" rel="noopener noreferrer" className="text-[12px] text-muted-foreground">{a.site_url}</a>
          <ul className="mt-2 space-y-0.5 text-[13px]">
            {Object.entries(a.reasons).map(([k, n]) => <li key={k}>{REPORT_REASON_LABEL[k as keyof typeof REPORT_REASON_LABEL] ?? k}: {n}</li>)}
          </ul>
          {a.notes.length > 0 && <ul className="mt-2 space-y-0.5 text-[12px] text-muted-foreground">{a.notes.map((n, i) => <li key={i}>« {n} »</li>)}</ul>}
          <div className="mt-3 flex gap-2">
            <button onClick={() => act(a.id, "hide")} className="h-9 rounded-xl bg-foreground px-3 text-[13px] font-bold text-background">Hide</button>
            <button onClick={() => act(a.id, "restore")} className="h-9 rounded-xl bg-muted px-3 text-[13px] font-bold">Keep online</button>
          </div>
        </div>
      ))}
    </div>
  );
}
