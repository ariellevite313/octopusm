"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { TokenPill } from "@/components/social/token-pill";
import type { FeaturedToken } from "@/lib/social/featured-token";
import { useIsMine } from "./profile-social";

type Hit = { id: string; name: string; ticker: string; logo_url: string | null };

export const OPEN_FEATURED_PICKER = "open-featured-token-picker";

/** Logo du token recommandé à côté du nom ; sur son propre profil : « + » pour en choisir un. */
export function FeaturedTokenControl({ wallet, token }: { wallet: string; token: FeaturedToken | null }) {
  const { tr } = useT();
  const mine = useIsMine(wallet);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const h = () => setOpen(true);
    window.addEventListener(OPEN_FEATURED_PICKER, h);
    return () => window.removeEventListener(OPEN_FEATURED_PICKER, h);
  }, []);

  return (
    <>
      {token ? (
        <TokenPill token={token} size={26} />
      ) : mine ? (
        <button
          onClick={() => setOpen(true)}
          aria-label={tr("Add a featured token")}
          title={tr("Add a featured token")}
          className="flex size-[26px] shrink-0 items-center justify-center rounded-[7px] border border-dashed border-muted-foreground/50 text-muted-foreground hover:border-foreground hover:text-foreground"
        >
          <Plus className="size-3.5" />
        </button>
      ) : null}
      {open && mine && <Picker hasToken={!!token} onClose={() => setOpen(false)} />}
    </>
  );
}

function Picker({ hasToken, onClose }: { hasToken: boolean; onClose: () => void }) {
  const { tr } = useT();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/launchpad/tokens?limit=12${q.trim() ? `&search=${encodeURIComponent(q.trim())}` : ""}`)
        .then((r) => r.json())
        .then((j) => !off && setHits(j.tokens ?? []))
        .catch(() => !off && setHits([]))
        .finally(() => !off && setLoading(false));
    }, 250);
    return () => { off = true; clearTimeout(t); };
  }, [q]);

  async function save(id: string | null) {
    setSaving(id ?? "remove");
    const r = await fetch("/api/profile/featured-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token_id: id }) });
    const j = await r.json().catch(() => ({}));
    setSaving(null);
    if (!r.ok) { toast.error(tr(j.error ?? "Something went wrong")); return; }
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[80vh] w-full max-w-md flex-col rounded-t-[28px] border border-border bg-card p-5 sm:rounded-[28px]">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">{tr("Featured token")}</h2>
          <button onClick={onClose} aria-label={tr("Close")} className="flex size-9 items-center justify-center rounded-full hover:bg-muted"><X className="size-5" /></button>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">{tr("Show the logo of a token launched on OMdotfun next to your name.")}</p>
        <div className="mb-3 flex items-center gap-2 rounded-full bg-muted px-4">
          <Search className="size-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder={tr("Search…")} className="h-11 flex-1 bg-transparent text-[15px] outline-none" />
        </div>
        <div className="-mx-2 min-h-[120px] flex-1 overflow-y-auto">
          {loading && hits.length === 0 ? (
            <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          ) : hits.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{tr("No tokens found")}</p>
          ) : hits.map((t) => (
            <button key={t.id} onClick={() => save(t.id)} disabled={!!saving} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-muted">
              {t.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.logo_url} alt="" className="size-10 rounded-[10px] border border-border object-cover" />
              ) : <span className="size-10 rounded-[10px] bg-muted" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-foreground">{t.name}</span>
                <span className="block text-xs text-muted-foreground">${t.ticker}</span>
              </span>
              {saving === t.id && <Loader2 className="size-4 animate-spin" />}
            </button>
          ))}
        </div>
        {hasToken && (
          <button onClick={() => save(null)} disabled={!!saving} className="mt-3 rounded-full border border-border py-3 text-sm font-bold text-foreground hover:bg-muted">
            {saving === "remove" ? <Loader2 className="mx-auto size-4 animate-spin" /> : tr("Remove featured token")}
          </button>
        )}
      </div>
    </div>
  );
}
