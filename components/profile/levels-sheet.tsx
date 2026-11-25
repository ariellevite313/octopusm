"use client";

/**
 * Bouton « Niveaux » du profil : niveau atteint, Omero restants jusqu'au suivant, nombre de personnes par niveau,
 * et (sur son propre profil) les animations : contours débloqués par niveau ou achetés en Omero, mascottes de la bannière.
 */
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, Lock, X } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { Mirage } from "@/components/shared/mirage";
import { FRAMES, canUseFrame, levelIndex, type FrameId } from "@/lib/profile-cosmetics";

type Level = { label: string; min: number; max: number | null; color: string; count: number };
type Data = { total: number; levels: Level[]; frame: string | null; buddies: boolean; owned: string[]; isMe: boolean; balance: number | null };

const BADGE: Record<string, string> = { Blue: "blue", Green: "green", Yellow: "yellow", Orange: "orange", Red: "red" };
const n = (x: number) => Math.round(x).toLocaleString("en-US");

function Preview({ frame, avatar, size = 52 }: { frame: FrameId | null; avatar: string | null; size?: number }) {
  const inner = avatar
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={avatar} alt="" className="rounded-full object-cover" style={{ width: size, height: size }} />
    : <span className="block rounded-full bg-muted" style={{ width: size, height: size }} />;
  return frame ? <span className={`om-frame om-frame-${frame}`}>{inner}</span> : inner;
}

export function LevelsButton({ wallet, avatar }: { wallet: string; avatar: string | null }) {
  const { tr } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/profile/levels?wallet=${encodeURIComponent(wallet)}`, { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j.levels) setD(j); }).catch(() => {});
  }, [wallet]);
  useEffect(() => { if (open) load(); }, [open, load]);

  async function act(body: Record<string, unknown>, key: string) {
    setBusy(key);
    try {
      const r = await fetch("/api/profile/cosmetics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Could not update right now");
      if (body.action === "buy") toast.success(tr("Animation unlocked"));
      setConfirm(null);
      load();
      router.refresh();
    } catch (e) { toast.error(tr((e as Error).message)); }
    setBusy(null);
  }

  const idx = d ? levelIndex(d.total) : -1;
  const cur = d && idx >= 0 ? d.levels[idx] : null;
  const next = d ? d.levels[idx + 1] ?? null : null;
  const from = cur ? cur.min : 0;
  const pct = d && next ? Math.min(100, Math.max(0, ((d.total - from) / (next.min - from)) * 100)) : 100;

  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-muted px-3 text-[13px] font-bold text-foreground transition-colors hover:bg-muted/70">
        {tr("Levels")}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-[2px] md:items-center" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-md overflow-y-auto scrollbar-none rounded-t-[28px] border-t border-border bg-background px-4 pb-8 pt-3 md:rounded-[28px] md:border">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[18px] font-bold">{tr("Levels")}</span>
              <button onClick={() => setOpen(false)} aria-label={tr("Close")} className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><X className="size-5" /></button>
            </div>

            {!d ? <div className="flex justify-center py-12"><Mirage className="size-5 text-muted-foreground" /></div> : (
              <>
                {/* Niveau actuel et progression */}
                <div className="rounded-[22px] border border-border bg-card p-4">
                  <div className="flex items-center gap-3">
                    {cur
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={`/badges/omero-${BADGE[cur.label]}.png`} alt="" className="size-12" />
                      : <span className="flex size-12 items-center justify-center rounded-full bg-muted"><Lock className="size-5 text-muted-foreground" /></span>}
                    <div className="min-w-0 flex-1">
                      <p className="text-[17px] font-bold">{cur ? tr("Level {name}", { name: tr(cur.label) }) : tr("No level yet")}</p>
                      <p className="num text-[14px] text-muted-foreground">{n(d.total)} Omero</p>
                    </div>
                  </div>
                  <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: next?.color ?? cur?.color ?? "var(--foreground)" }} />
                  </div>
                  <p className="mt-2 text-[13px] font-semibold text-muted-foreground">
                    {next ? tr("{n} Omero left to reach {name}", { n: n(next.min - d.total), name: tr(next.label) }) : tr("Highest level reached")}
                  </p>
                </div>

                {/* Tous les niveaux */}
                <div className="mt-4 overflow-hidden rounded-[22px] border border-border bg-card">
                  {d.levels.map((l, i) => {
                    const reached = idx >= i;
                    return (
                      <div key={l.label} className={`flex items-center gap-3 px-4 py-3 ${i ? "border-t border-border" : ""} ${i === idx ? "bg-muted/60" : ""}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/badges/omero-${BADGE[l.label]}.png`} alt="" className={`size-8 ${reached ? "" : "opacity-35 grayscale"}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-bold">{tr(l.label)}</p>
                          <p className="num text-[12px] text-muted-foreground">{l.max ? `${n(l.min)} – ${n(l.max)}` : `${n(l.min)}+`} Omero</p>
                        </div>
                        <div className="text-right">
                          <p className="num text-[15px] font-bold">{n(l.count)}</p>
                          <p className="text-[11px] text-muted-foreground">{tr(l.count === 1 ? "person" : "people")}</p>
                        </div>
                        <span className="flex w-6 justify-end">{reached ? <Check className="size-4 text-up" /> : <Lock className="size-3.5 text-muted-foreground" />}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Animations : sur son propre profil seulement */}
                {d.isMe && (
                  <>
                    <div className="mt-5 flex items-center justify-between">
                      <p className="text-[16px] font-bold">{tr("Animations")}</p>
                      {d.balance != null && <p className="num text-[13px] font-semibold text-muted-foreground">{n(d.balance)} Omero</p>}
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {FRAMES.map((f) => {
                        const usable = canUseFrame(f, d.total, d.owned);
                        const worn = d.frame === f.id;
                        const cost = "cost" in f.unlock ? f.unlock.cost : null;
                        const lvl = "level" in f.unlock ? f.unlock.level : null;
                        const k = `f:${f.id}`;
                        return (
                          <div key={f.id} className={`flex flex-col items-center rounded-[18px] border p-3 ${worn ? "border-foreground" : "border-border"} bg-card`}>
                            <div className="flex h-[66px] items-center justify-center"><Preview frame={f.id} avatar={avatar} /></div>
                            <p className="mt-1 truncate text-[12px] font-bold">{tr(f.name)}</p>
                            {worn ? (
                              <button onClick={() => act({ action: "equip", frame: null }, k)} disabled={!!busy} className="mt-2 h-8 w-full rounded-full bg-foreground text-[12px] font-bold text-background">{busy === k ? <Mirage className="mx-auto size-3.5" /> : tr("Worn")}</button>
                            ) : usable ? (
                              <button onClick={() => act({ action: "equip", frame: f.id }, k)} disabled={!!busy} className="mt-2 h-8 w-full rounded-full bg-muted text-[12px] font-bold">{busy === k ? <Mirage className="mx-auto size-3.5" /> : tr("Wear")}</button>
                            ) : cost ? (
                              confirm === f.id
                                ? <button onClick={() => act({ action: "buy", frame: f.id }, k)} disabled={!!busy} className="mt-2 h-8 w-full rounded-full bg-foreground text-[12px] font-bold text-background">{busy === k ? <Mirage className="mx-auto size-3.5" /> : tr("Confirm")}</button>
                                : <button onClick={() => setConfirm(f.id)} className="num mt-2 h-8 w-full rounded-full bg-muted text-[12px] font-bold">{n(cost)} Omero</button>
                            ) : (
                              <span className="mt-2 flex h-8 w-full items-center justify-center gap-1 rounded-full bg-muted/50 text-[12px] font-semibold text-muted-foreground"><Lock className="size-3" />{tr(lvl ?? "")}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-3 flex items-center justify-between rounded-[18px] border border-border bg-card px-4 py-3">
                      <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/profile/omero-peek.png" alt="" className="om-buddy h-9 w-auto" />
                        <span className="text-[14px] font-bold">{tr("Omero mascots on my banner")}</span>
                      </div>
                      <button role="switch" aria-checked={d.buddies} onClick={() => act({ action: "buddies", on: !d.buddies }, "b")} disabled={!!busy}
                        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${d.buddies ? "bg-foreground" : "bg-muted"}`}>
                        <span className={`absolute top-1 size-5 rounded-full bg-background transition-all ${d.buddies ? "left-6" : "left-1"}`} />
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
