"use client";

/**
 * Double vérification (2FA) côté écran :
 *  - TwoFactorCard : activer (QR code + premier code + codes de secours) ou désactiver
 *  - TwoFactorPrompt + fetch2fa : quand une action sensible demande le code, une fenêtre le demande puis la requête repart
 */
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

// ── Demande du code pour une action sensible ─────────────────────────────────
let ask: ((reason: string) => Promise<string | null>) | null = null;

/** fetch qui, si le serveur demande le code 2FA, ouvre la fenêtre de code puis rejoue la requête avec l'en-tête x-2fa-code. */
export async function fetch2fa(url: string, init: RequestInit = {}): Promise<Response> {
  const r = await fetch(url, init);
  if (r.status !== 401 || !ask) return r;
  const j = await r.clone().json().catch(() => ({}));
  if (!j?.twofa) return r;
  for (let i = 0; i < 3; i++) {
    const code = await ask(i ? "Wrong code, try again" : "");
    if (!code) return r;
    const again = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), "x-2fa-code": code } });
    if (again.status !== 401) return again;
  }
  return r;
}

export function TwoFactorPrompt() {
  const { tr } = useT();
  const [open, setOpen] = useState<{ reason: string } | null>(null);
  const [code, setCode] = useState("");
  const done = useRef<((c: string | null) => void) | null>(null);
  useEffect(() => {
    ask = (reason) => new Promise((res) => { done.current = res; setCode(""); setOpen({ reason }); });
    return () => { ask = null; };
  }, []);
  const close = (c: string | null) => { done.current?.(c); done.current = null; setOpen(null); };
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={() => close(null)}>
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 text-[17px] font-bold text-foreground"><ShieldCheck className="size-5" />{tr("Two-step verification")}</div>
        <p className="mt-1 text-[14px] text-muted-foreground">{tr("Enter the 6-digit code from your authenticator app, or a recovery code.")}</p>
        {open.reason && <p className="mt-2 text-[13px] font-semibold text-down">{tr(open.reason)}</p>}
        <input autoFocus value={code} onChange={(e) => setCode(e.target.value.slice(0, 12))} onKeyDown={(e) => e.key === "Enter" && code.trim() && close(code.trim())}
          inputMode="text" autoComplete="one-time-code" placeholder="123456"
          className="num mt-4 w-full rounded-2xl border border-border bg-transparent px-4 py-3 text-center text-[24px] font-bold tracking-[0.3em] outline-none focus:border-foreground/40" />
        <div className="mt-4 flex gap-2">
          <button onClick={() => close(null)} className="h-11 flex-1 rounded-full bg-muted text-[14px] font-semibold text-foreground">{tr("Cancel")}</button>
          <button onClick={() => code.trim() && close(code.trim())} disabled={!code.trim()} className="h-11 flex-1 rounded-full bg-foreground text-[14px] font-bold text-background disabled:opacity-40">{tr("Confirm")}</button>
        </div>
      </div>
    </div>
  );
}

// ── Activer / désactiver ─────────────────────────────────────────────────────
export function TwoFactorCard() {
  const { tr } = useT();
  const [st, setSt] = useState<{ enabled: boolean; recoveryLeft: number } | null>(null);
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const load = () => fetch("/api/2fa", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then(setSt).catch(() => {});
  useEffect(() => { void load(); }, []);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = await fetch("/api/2fa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Something went wrong");
      return j;
    } catch (e) { toast.error(tr((e as Error).message)); return null; }
    finally { setBusy(false); }
  }
  const start = async () => { const j = await post({ action: "setup" }); if (j) { setSetup(j); setCode(""); } };
  const confirm = async () => { const j = await post({ action: "enable", code }); if (j) { setSetup(null); setCodes(j.recovery); setCode(""); void load(); } };
  const off = async () => { const j = await post({ action: "disable", code }); if (j) { toast.success(tr("Two-step verification is off")); setCode(""); void load(); } };

  if (!st) return <div className="h-24 animate-pulse rounded-2xl bg-muted/30" />;
  const input = "num w-full rounded-2xl border border-border bg-transparent px-4 py-3 text-center text-[20px] font-bold tracking-[0.25em] outline-none focus:border-foreground/40";

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-muted"><ShieldCheck className="size-5 text-foreground" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">{tr("Two-step verification")}</p>
          <p className="text-xs text-muted-foreground">{st.enabled ? tr("On. Asked for AI wallets: create, limits, withdraw.") : tr("Off. Protect your AI wallets with an authenticator app.")}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${st.enabled ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>{st.enabled ? tr("On") : tr("Off")}</span>
      </div>

      {codes && (
        <div className="mt-4 rounded-2xl bg-muted/50 p-4">
          <p className="text-[14px] font-bold text-foreground">{tr("Save your recovery codes")}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{tr("Each code works once if you lose your phone. They will not be shown again.")}</p>
          <div className="num mt-3 grid grid-cols-2 gap-2 text-[15px] font-semibold text-foreground">{codes.map((c) => <span key={c}>{c}</span>)}</div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => { void navigator.clipboard?.writeText(codes.join("\n")); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-muted text-[14px] font-semibold text-foreground">{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{tr("Copy")}</button>
            <button onClick={() => setCodes(null)} className="h-10 flex-1 rounded-full bg-foreground text-[14px] font-bold text-background">{tr("I saved them")}</button>
          </div>
        </div>
      )}

      {!st.enabled && !setup && !codes && (
        <button onClick={start} disabled={busy} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[14px] font-bold text-background disabled:opacity-50">
          {busy && <Loader2 className="size-4 animate-spin" />}{tr("Turn on")}
        </button>
      )}

      {setup && (
        <div className="mt-4 space-y-3">
          <p className="text-[14px] text-muted-foreground">{tr("1. Scan this QR code with your authenticator app (Google Authenticator, Authy…).")}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt="" width={200} height={200} className="mx-auto rounded-xl bg-white p-2" />
          <p className="text-center text-[12px] text-muted-foreground">{tr("Or enter this key")}: <span className="num select-all font-semibold text-foreground">{setup.secret.match(/.{1,4}/g)?.join(" ")}</span></p>
          <p className="text-[14px] text-muted-foreground">{tr("2. Enter the 6-digit code shown in the app.")}</p>
          <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" className={input} />
          <div className="flex gap-2">
            <button onClick={() => setSetup(null)} className="h-11 flex-1 rounded-full bg-muted text-[14px] font-semibold text-foreground">{tr("Cancel")}</button>
            <button onClick={confirm} disabled={busy || code.length !== 6} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-foreground text-[14px] font-bold text-background disabled:opacity-40">{busy && <Loader2 className="size-4 animate-spin" />}{tr("Turn on")}</button>
          </div>
        </div>
      )}

      {st.enabled && !codes && (
        <div className="mt-4 space-y-2">
          <p className="text-[13px] text-muted-foreground">{tr("{n} recovery codes left.", { n: st.recoveryLeft })} {tr("To turn it off, enter a code from your app or a recovery code.")}</p>
          <div className="flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value.slice(0, 12))} placeholder="123456" autoComplete="one-time-code" className={`${input} text-[16px]`} />
            <button onClick={off} disabled={busy || !code.trim()} className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-muted px-5 text-[14px] font-semibold text-foreground disabled:opacity-40">{busy && <Loader2 className="size-4 animate-spin" />}{tr("Turn off")}</button>
          </div>
        </div>
      )}
    </section>
  );
}
