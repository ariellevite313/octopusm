"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";

type App = { client_id: string; name: string; scopes: string[]; connected_at: string; last_used_at: string | null };

export function ConnectedApps() {
  const { tr } = useT();
  const { isAuthenticated } = useAuth();
  const [apps, setApps] = useState<App[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const url = typeof window !== "undefined" ? `${window.location.origin}/mcp/connect` : "https://omdot.fun/mcp/connect";

  const load = useCallback(() => {
    fetch("/api/oauth/apps", { cache: "no-store" }).then((r) => r.json()).then((j) => setApps(j.apps ?? [])).catch(() => setApps([]));
  }, []);
  useEffect(() => { if (isAuthenticated) load(); }, [isAuthenticated, load]);

  async function revoke(id: string) {
    setBusy(id);
    await fetch(`/api/oauth/apps?client_id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    setBusy(null);
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">{tr("Connected apps")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{tr("AI assistants you allowed to use your OMdotfun account.")}</p>

      <div className="mt-5 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-semibold text-foreground">{tr("Connect an assistant")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{tr("In Claude, ChatGPT or any assistant that supports connectors, add this address, then click Connect.")}</p>
        <button
          onClick={() => { navigator.clipboard.writeText(url).then(() => toast.success(tr("Link copied"))).catch(() => {}); }}
          className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl bg-muted px-4 py-3 text-left font-mono text-sm text-foreground"
        >
          <span className="truncate">{url}</span>
          <Copy className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </div>

      {!isAuthenticated ? (
        <button onClick={() => window.dispatchEvent(new CustomEvent("open-wallet-connect"))} className="btn-primary mt-6 flex h-12 w-full items-center justify-center rounded-full text-[15px]">
          {tr("Connect Wallet")}
        </button>
      ) : apps === null ? (
        <div className="mt-6 h-24 animate-pulse rounded-2xl bg-muted/30" />
      ) : apps.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">{tr("No connected apps yet.")}</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {apps.map((a) => (
            <li key={a.client_id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary"><Bot className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">{a.name}</p>
                <p className="text-xs text-muted-foreground">{a.scopes.join(" · ")}</p>
              </div>
              <button onClick={() => revoke(a.client_id)} disabled={busy === a.client_id} className="rounded-full border border-border px-4 py-2 text-sm font-bold text-foreground hover:bg-muted">
                {busy === a.client_id ? <Loader2 className="size-4 animate-spin" /> : tr("Disconnect")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
