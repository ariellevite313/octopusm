"use client";

/**
 * Admin : créer et publier une image « Top 10 » (Launchpad OM ou une chaîne du Terminal) :
 * capitalisation, volume, hausses, baisses, tokens vendus par l'équipe, sur le jour, la semaine ou le mois.
 * L'image est figée à sa création ; on la partage ensuite (fil OM, X, Telegram, téléchargement).
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import { BarChart3, X } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/providers/auth-provider";
import { CHAINS, GT_NET } from "@/lib/terminal";
import { ShareSheet } from "@/components/shared/share-sheet";
import { Mirage } from "@/components/shared/mirage";

type Kind = "mcap" | "volume" | "gainers" | "losers" | "dev_sold";
type Period = "day" | "week" | "month";
const KINDS: { id: Kind; label: string }[] = [
  { id: "mcap", label: "Market cap" }, { id: "volume", label: "Volume" }, { id: "gainers", label: "Gainers" },
  { id: "losers", label: "Losers" }, { id: "dev_sold", label: "Sold by the team" },
];
const PERIODS: { id: Period; label: string }[] = [{ id: "day", label: "Day" }, { id: "week", label: "Week" }, { id: "month", label: "Month" }];
const SOURCES = [{ id: "om", name: "OM Launchpad", logo: "/og-logo.png" }, ...CHAINS.filter((c) => GT_NET[c.id]).map((c) => ({ id: c.id as string, name: c.name, logo: c.logo }))];
const hasPeriod = (k: Kind) => k === "volume" || k === "gainers" || k === "losers";
const devOk = (s: string) => s === "om" || s === "solana";

function Chip({ on, onClick, children, disabled }: { on: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return <button disabled={disabled} onClick={onClick} className={`flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold disabled:opacity-35 ${on ? "bg-foreground text-background" : "bg-muted text-foreground"}`}>{children}</button>;
}

export function TopPublisher({ defaultSource = "solana", className }: { defaultSource?: string; className?: string }) {
  const { tr } = useT();
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState(defaultSource);
  const [kind, setKind] = useState<Kind>("mcap");
  const [period, setPeriod] = useState<Period>("day");
  const [busy, setBusy] = useState(false);
  const [id, setId] = useState<string | null>(null);
  const [share, setShare] = useState(false);
  // Texte qui accompagne l'image (modifiable), avec les tickers du classement
  const [caption, setCaption] = useState("");
  if (!isAdmin) return null;

  const reset = () => setId(null);
  async function create() {
    setBusy(true); setId(null);
    try {
      const r = await fetch("/api/admin/top", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source, kind, period }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Could not build the list, try again");
      setId(j.id);
      const syms = ((j.symbols ?? []) as string[]).map((x, i) => `${i + 1}. $${x.replace(/^\$+/, "")}`);
      setCaption(syms.length ? `${text}\n\n${syms.join("\n")}` : text);
    } catch (e) { toast.error(tr((e as Error).message)); }
    setBusy(false);
  }
  const srcName = SOURCES.find((s) => s.id === source)?.name ?? source;
  const kindName = KINDS.find((k) => k.id === kind)?.label ?? "";
  const text = `Top 10 ${kindName.toLowerCase()}${hasPeriod(kind) ? ` (${period === "day" ? "24h" : period === "week" ? "7 days" : "30 days"})` : ""} · ${srcName} · OMdotfun`;

  return (
    <>
      <button onClick={() => setOpen(true)} className={className ?? "flex h-10 items-center gap-2 rounded-xl bg-muted px-3.5 text-[14px] font-semibold text-foreground hover:bg-muted/70"}>
        <BarChart3 className="size-4" />{tr("Publish a Top 10")}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-[2px] md:items-center" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-md overflow-y-auto scrollbar-none rounded-t-[28px] border-t border-border bg-background px-4 pb-8 pt-2 md:rounded-[28px] md:border">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[17px] font-bold">{tr("Publish a Top 10")}</span>
              <button onClick={() => setOpen(false)} aria-label={tr("Close")} className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><X className="size-5" /></button>
            </div>

            <p className="mt-1 text-[13px] font-semibold text-muted-foreground">{tr("Where")}</p>
            <div className="-mx-4 mt-1.5 flex gap-1.5 overflow-x-auto scrollbar-none px-4">
              {SOURCES.map((s) => (
                <Chip key={s.id} on={source === s.id} onClick={() => { setSource(s.id); if (kind === "dev_sold" && !devOk(s.id)) setKind("mcap"); reset(); }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.logo} alt="" className="size-4 rounded-full object-cover" />{s.id === "om" ? tr("OM Launchpad") : s.name}
                </Chip>
              ))}
            </div>

            <p className="mt-3 text-[13px] font-semibold text-muted-foreground">{tr("Ranking")}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {KINDS.map((k) => <Chip key={k.id} on={kind === k.id} disabled={k.id === "dev_sold" && !devOk(source)} onClick={() => { setKind(k.id); reset(); }}>{tr(k.label)}</Chip>)}
            </div>
            {kind === "dev_sold" && <p className="mt-1.5 text-[12px] text-muted-foreground">{tr("Team sales are only tracked on Solana.")}</p>}

            {hasPeriod(kind) && <>
              <p className="mt-3 text-[13px] font-semibold text-muted-foreground">{tr("Period")}</p>
              <div className="mt-1.5 flex gap-1.5">{PERIODS.map((p) => <Chip key={p.id} on={period === p.id} onClick={() => { setPeriod(p.id); reset(); }}>{tr(p.label)}</Chip>)}</div>
            </>}

            {id ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/og/top/${id}`} alt="" className="mt-4 w-full rounded-2xl bg-muted" style={{ aspectRatio: "1080 / 1350" }} />
                <p className="mt-3 text-[13px] font-semibold text-muted-foreground">{tr("Text")}</p>
                <textarea value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 1000))} rows={7}
                  className="mt-1.5 w-full resize-y rounded-2xl bg-muted px-3.5 py-3 text-[14px] leading-snug text-foreground outline-none" />
                <div className="mt-3 flex gap-2">
                  <button onClick={create} disabled={busy} className="h-12 flex-1 rounded-2xl bg-muted text-[15px] font-semibold text-foreground">{busy ? <Mirage className="mx-auto size-4" /> : tr("Refresh")}</button>
                  <button onClick={() => setShare(true)} className="h-12 flex-[2] rounded-2xl bg-foreground text-[15px] font-bold text-background">{tr("Publish")}</button>
                </div>
              </>
            ) : (
              <button onClick={create} disabled={busy} className="mt-4 h-12 w-full rounded-2xl bg-foreground text-[15px] font-bold text-background disabled:opacity-60">
                {busy ? <span className="flex items-center justify-center gap-2"><Mirage className="size-4" />{tr("Reading the markets…")}</span> : tr("Create the image")}
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
      {id && (
        <ShareSheet open={share} onClose={() => setShare(false)} portrait images={[`/api/og/top/${id}`]} url={`/share/top/${id}`}
          text={caption.trim() || text} perks={[]} fileName={`omdot-top10-${source}-${kind}.png`} />
      )}
    </>
  );
}
