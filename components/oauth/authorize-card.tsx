"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bot, Check, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { T } from "@/lib/i18n-mark";
import { shortAddress } from "@/lib/format";

const PERMS = [
  { id: "read", label: T("Read markets, tokens, profiles and the feed"), locked: true },
  { id: "social", label: T("Post, reply, like, follow and edit your profile"), locked: false },
  { id: "approvals", label: T("Suggest bets and trades that you confirm yourself"), locked: false },
] as const;

export function AuthorizeCard() {
  const { tr } = useT();
  const sp = useSearchParams();
  const { isAuthenticated, walletAddress } = useAuth();
  const [app, setApp] = useState<{ name: string; redirect_host: string } | null>(null);
  const [bad, setBad] = useState<string | null>(null);
  const [busy, setBusy] = useState<"allow" | "deny" | null>(null);
  const asked = (sp.get("scope") ?? "").split(/\s+/).filter(Boolean);
  const [on, setOn] = useState<Record<string, boolean>>({ read: true, social: asked.length === 0 || asked.includes("social"), approvals: asked.length === 0 || asked.includes("approvals") });

  const client_id = sp.get("client_id") ?? "";
  const redirect_uri = sp.get("redirect_uri") ?? "";

  useEffect(() => {
    if (sp.get("response_type") !== "code" || !sp.get("code_challenge")) { setBad(tr("This connection link is not valid.")); return; }
    fetch(`/api/oauth/authorize?client_id=${encodeURIComponent(client_id)}&redirect_uri=${encodeURIComponent(redirect_uri)}`)
      .then(async (r) => (r.ok ? setApp(await r.json()) : setBad(tr("Unknown application. Start the connection again from your assistant."))))
      .catch(() => setBad(tr("Something went wrong")));
  }, [client_id, redirect_uri, sp, tr]);

  async function decide(approve: boolean) {
    setBusy(approve ? "allow" : "deny");
    const r = await fetch("/api/oauth/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        approve, client_id, redirect_uri, state: sp.get("state") ?? undefined,
        code_challenge: sp.get("code_challenge"), code_challenge_method: sp.get("code_challenge_method") ?? "S256",
        scope: Object.entries(on).filter(([, v]) => v).map(([k]) => k).join(" "),
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.redirect) { setBusy(null); setBad(tr(j.error ?? "Something went wrong")); return; }
    window.location.href = j.redirect;
  }

  if (bad) return <div className="rounded-[28px] border border-border bg-card p-6 text-center text-sm text-muted-foreground">{bad}</div>;
  if (!app) return <div className="h-96 animate-pulse rounded-[28px] bg-muted/30" />;

  return (
    <div className="rounded-[28px] border border-border bg-card p-6">
      <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary"><Bot className="size-7" /></span>
      <h1 className="mt-4 text-center text-2xl font-bold tracking-tight text-foreground">{tr("Connect {name}", { name: app.name })}</h1>
      <p className="mt-1 text-center text-sm text-muted-foreground">{tr("to your OMdotfun account")}</p>

      <ul className="mt-6 space-y-2">
        {PERMS.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              disabled={p.locked}
              onClick={() => setOn((o) => ({ ...o, [p.id]: !o[p.id] }))}
              className="flex w-full items-center gap-3 rounded-2xl bg-muted/50 px-4 py-3 text-left text-sm text-foreground disabled:cursor-default"
            >
              <span className={`flex size-5 shrink-0 items-center justify-center rounded-md border ${on[p.id] ? "border-primary bg-primary text-white" : "border-border"}`}>
                {on[p.id] && <Check className="size-3.5" strokeWidth={3} />}
              </span>
              {tr(p.label)}
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex gap-3 rounded-2xl border border-border p-3 text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-up" />
        <p>{tr("The assistant never gets your keys and cannot move your money. You can cut its access at any time from Connected apps.")}</p>
      </div>

      {isAuthenticated && walletAddress ? (
        <>
          <p className="mt-5 text-center text-xs text-muted-foreground">
            {tr("Connected wallet")}: <span className="font-mono text-foreground">{shortAddress(walletAddress)}</span>
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button onClick={() => decide(false)} disabled={!!busy} className="rounded-full border border-border py-3 text-sm font-bold text-foreground hover:bg-muted">
              {busy === "deny" ? <Loader2 className="mx-auto size-4 animate-spin" /> : tr("Cancel")}
            </button>
            <button onClick={() => decide(true)} disabled={!!busy} className="rounded-full bg-primary py-3 text-sm font-bold text-white">
              {busy === "allow" ? <Loader2 className="mx-auto size-4 animate-spin" /> : tr("Allow")}
            </button>
          </div>
        </>
      ) : (
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-wallet-connect"))}
          className="btn-primary mt-5 flex h-12 w-full items-center justify-center rounded-full text-[15px]"
        >
          {tr("Connect Wallet")}
        </button>
      )}
      <p className="mt-4 text-center text-xs text-muted-foreground">{tr("You will be sent back to {host}", { host: app.redirect_host })}</p>
    </div>
  );
}
