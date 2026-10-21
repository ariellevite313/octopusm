"use client";

import { useState } from "react";
import { EyeOff, Trash2, Check } from "lucide-react";

export type ReportedPost = {
  id: string; author: string; body: string; images: string[]; hidden: boolean; created_at: string;
  reports: number; reasons: string[];
};

export function AdminReportsClient({ items: initial }: { items: ReportedPost[] }) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(id: string, action: "hide" | "delete" | "dismiss") {
    setBusy(id);
    const res = await fetch(`/api/admin/reports/${id}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
    });
    setBusy(null);
    if (res.ok) setItems((l) => l.filter((p) => p.id !== id));
  }

  async function ban(wallet: string, postId: string) {
    if (!window.confirm("Ban this wallet? Its posts are hidden and connected apps are cut.")) return;
    setBusy(postId);
    const res = await fetch("/api/admin/moderation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ban", wallet, reason: "Reported posts" }) });
    setBusy(null);
    if (res.ok) setItems((l) => l.filter((x) => x.author !== wallet));
  }

  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nothing to review.</p>;
  return (
    <div className="space-y-3">
      {items.map((p) => (
        <div key={p.id} className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{p.author.slice(0, 6)}…{p.author.slice(-4)}</span>
            <span>{p.reports} report{p.reports > 1 ? "s" : ""}{p.hidden ? " · hidden" : ""}</span>
          </div>
          {p.body && <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{p.body}</p>}
          {p.images.length > 0 && (
            <div className="mt-2 flex gap-2">
              {p.images.map((u) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={u} src={u} alt="" className="h-24 rounded-lg object-cover" />
              ))}
            </div>
          )}
          {p.reasons.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{p.reasons.join(" · ")}</p>}
          <div className="mt-3 flex gap-2">
            <button disabled={busy === p.id} onClick={() => act(p.id, "hide")} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"><EyeOff className="size-3.5" />Hide</button>
            <button disabled={busy === p.id} onClick={() => act(p.id, "delete")} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-down hover:bg-muted"><Trash2 className="size-3.5" />Delete</button>
            <button disabled={busy === p.id} onClick={() => ban(p.author, p.id)} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-down hover:bg-muted">Ban author</button>
            <button disabled={busy === p.id} onClick={() => act(p.id, "dismiss")} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"><Check className="size-3.5" />Dismiss</button>
          </div>
        </div>
      ))}
    </div>
  );
}
