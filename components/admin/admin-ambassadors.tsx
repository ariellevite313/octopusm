"use client";

/** Admin : candidatures ambassadeur, validation (20 places), retrait. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

type App = {
  wallet: string; x_handle: string | null; telegram: string | null; other_links: string | null; followers: number; country: string | null; language: string | null;
  crypto_since: string | null; communities: string | null; events: string | null; content_links: string | null; other_programs: string | null;
  motivation: string | null; target_month: number | null; status: string; created_at: string;
};
type Amb = { wallet: string; active: boolean; community_id: string | null; approved_at: string };

const short = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`;

export function AdminAmbassadors() {
  const [apps, setApps] = useState<App[]>([]);
  const [ambs, setAmbs] = useState<Amb[]>([]);
  const [max, setMax] = useState(20);
  const [community, setCommunity] = useState<Record<string, string>>({});
  const [until, setUntil] = useState(""), [results, setResults] = useState("");
  const toLocal = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

  const load = () => fetch("/api/admin/ambassadors", { cache: "no-store" }).then((r) => r.json()).then((j) => { setApps(j.applications ?? []); setAmbs(j.ambassadors ?? []); setMax(j.max ?? 20); setUntil(toLocal(j.settings?.apply_until)); setResults(toLocal(j.settings?.results_at)); }).catch(() => {});
  useEffect(() => { load(); }, []);

  async function act(wallet: string, action: "approve" | "reject" | "remove") {
    if (action !== "approve" && !confirm(action === "remove" ? "Remove this ambassador?" : "Reject this application?")) return;
    const r = await fetch("/api/admin/ambassadors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet, action, community: community[wallet] || undefined }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(j.error ?? "Error"); return; }
    toast.success("Done");
    load();
  }

  async function saveSettings() {
    const r = await fetch("/api/admin/ambassadors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "settings", apply_until: until ? new Date(until).toISOString() : null, results_at: results ? new Date(results).toISOString() : null }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(j.error ?? "Error"); return; }
    toast.success("Session saved");
  }
  const active = ambs.filter((a) => a.active);
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">Ambassadors</h1>
        <p className="mt-1 text-sm text-muted-foreground">{active.length} / {max} places taken. An ambassador earns 20% of the platform fee on their referrals (10% for others), and their referrals get 200 OMERO and join the chosen community.</p>
      </div>
      <section className="rounded-2xl border border-border p-4 text-sm">
        <h2 className="mb-2 font-bold">Application session</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1">Apply until<input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} className="h-9 rounded-xl border border-border bg-transparent px-3" /></label>
          <label className="grid gap-1">Results on<input type="datetime-local" value={results} onChange={(e) => setResults(e.target.value)} className="h-9 rounded-xl border border-border bg-transparent px-3" /></label>
          <button onClick={saveSettings} className="h-9 rounded-xl bg-foreground px-4 font-bold text-background">Save</button>
        </div>
        <p className="mt-2 text-muted-foreground">The form closes by itself at the deadline. Set a new date to open a new session.</p>
      </section>
      <section>
        <h2 className="mb-2 font-bold">Applications</h2>
        <div className="space-y-3">
          {apps.filter((a) => a.status === "pending" || a.status === "rejected").map((a) => (
            <div key={a.wallet} className="rounded-2xl border border-border p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/profile/${a.wallet}`} className="font-mono font-semibold hover:underline">{short(a.wallet)}</Link>
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs">{a.status}</span>
                {a.x_handle && <a href={`https://x.com/${a.x_handle}`} target="_blank" rel="noreferrer" className="hover:underline">@{a.x_handle}</a>}
                {a.telegram && <span>TG: {a.telegram}</span>}
                <span>{a.followers.toLocaleString()} followers</span>
                {a.country && <span>· {a.country}</span>}{a.language && <span>· {a.language}</span>}
              </div>
              <dl className="mt-2 grid gap-1 text-muted-foreground">
                {([["Other links", a.other_links], ["In crypto since", a.crypto_since], ["Communities", a.communities], ["Events", a.events], ["Content", a.content_links], ["Other programs", a.other_programs], ["Plan", a.motivation], ["Target / month", a.target_month ? String(a.target_month) : null]] as [string, string | null][])
                  .filter(([, v]) => v).map(([k, v]) => <div key={k}><dt className="inline font-semibold text-foreground">{k}: </dt><dd className="inline whitespace-pre-line break-words">{v}</dd></div>)}
              </dl>
              {a.status === "pending" && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input value={community[a.wallet] ?? ""} onChange={(e) => setCommunity({ ...community, [a.wallet]: e.target.value })} placeholder="Community address (optional)" className="h-9 rounded-xl border border-border bg-transparent px-3 text-sm" />
                  <button onClick={() => act(a.wallet, "approve")} className="h-9 rounded-xl bg-foreground px-4 font-bold text-background">Approve</button>
                  <button onClick={() => act(a.wallet, "reject")} className="h-9 rounded-xl border border-border px-4 font-bold">Reject</button>
                </div>
              )}
            </div>
          ))}
          {!apps.some((a) => a.status === "pending" || a.status === "rejected") && <p className="text-sm text-muted-foreground">No application.</p>}
        </div>
      </section>
      <section>
        <h2 className="mb-2 font-bold">Active ambassadors</h2>
        <div className="divide-y divide-border rounded-2xl border border-border">
          {active.map((a) => (
            <div key={a.wallet} className="flex items-center gap-3 p-3 text-sm">
              <Link href={`/profile/${a.wallet}`} className="font-mono font-semibold hover:underline">{short(a.wallet)}</Link>
              <span className="text-muted-foreground">since {new Date(a.approved_at).toLocaleDateString()}</span>
              <button onClick={() => act(a.wallet, "remove")} className="ml-auto h-8 rounded-xl border border-border px-3 font-bold">Remove</button>
            </div>
          ))}
          {!active.length && <p className="p-3 text-sm text-muted-foreground">No ambassador yet.</p>}
        </div>
      </section>
    </div>
  );
}
