"use client";
/**
 * Ticker DRC-20 réservé : message et formulaire de demande. Seule l'équipe du projet, vérifiée par OM, peut le lancer.
 */
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

type Info = { reserved: boolean; allowed?: boolean; pending?: boolean; original?: string };

export function useReservedTicker(ticker: string) {
  const [info, setInfo] = useState<Info>({ reserved: false });
  useEffect(() => {
    const t = ticker.trim();
    if (!t) { setInfo({ reserved: false }); return; }
    const id = setTimeout(() => {
      fetch(`/api/launchpad/ticker-request?ticker=${encodeURIComponent(t)}`).then((r) => r.json()).then(setInfo).catch(() => setInfo({ reserved: false }));
    }, 350);
    return () => clearTimeout(id);
  }, [ticker]);
  return { info, setInfo };
}

export function ReservedTickerBox({ ticker, info, onSent }: { ticker: string; info: Info; onSent: () => void }) {
  const { tr } = useT();
  const [open, setOpen] = useState(false);
  const [x, setX] = useState("");
  const [contact, setContact] = useState("");
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!info.reserved || info.allowed) return null;

  const send = async () => {
    setSending(true); setErr(null);
    try {
      const r = await fetch("/api/launchpad/ticker-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker, x_handle: x, contact, message: msg }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Could not send your request");
      setOpen(false); onSent();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not send your request"); } finally { setSending(false); }
  };

  const field = "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground/40";
  return (
    <div className="mt-2 space-y-2 rounded-2xl border border-border bg-muted/50 p-3">
      <p className="text-[13px] font-semibold text-foreground">{tr("${ticker} is a reserved DRC-20 ticker", { ticker: ticker.toUpperCase() })}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">{tr("To protect holders, only the project's verified team can launch it on OM. If you are on the team, send a request: we check the project's X account before approving.")}</p>
      {info.pending ? (
        <p className="text-xs font-semibold text-foreground">{tr("Request sent. We will review it soon.")}</p>
      ) : !open ? (
        <button type="button" onClick={() => setOpen(true)} className="rounded-xl bg-foreground px-4 py-2 text-[13px] font-bold text-background">{tr("Submit a request")}</button>
      ) : (
        <div className="space-y-2">
          <input value={x} onChange={(e) => setX(e.target.value)} placeholder={tr("Project X account (e.g. @DogiDrc20)")} className={field} />
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder={tr("Contact (Telegram, email…)")} className={field} />
          <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={2} maxLength={600} placeholder={tr("Your role in the team")} className={`${field} resize-none`} />
          {err && <p className="text-xs text-red-500">{tr(err)}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={sending || !x.trim()} onClick={() => void send()} className="rounded-xl bg-foreground px-4 py-2 text-[13px] font-bold text-background disabled:opacity-50">{sending ? tr("Sending…") : tr("Send")}</button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-border px-4 py-2 text-[13px] font-semibold text-muted-foreground">{tr("Cancel")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
