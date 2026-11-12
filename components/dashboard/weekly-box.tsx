"use client";

/**
 * Box de la semaine : mon score, mon rang, le compte à rebours, le top 10,
 * et pour le gagnant de la semaine passée la box à ouvrir, réclamer et partager.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { T } from "@/lib/i18n-mark";
import { shortAddress } from "@/lib/format";
import { ShareSheet } from "@/components/shared/share-sheet";
import type { Activity } from "@/lib/weekly-box";

type Person = { wallet: string; name: string | null; avatar: string | null };
type Data = {
  week: { start: string; end: string };
  rules: { points: Record<Activity, number>; caps: Record<Activity, number>; prizeSol: number; topN: number };
  me: { points: number; counts: Partial<Record<Activity, number>>; eligible: boolean; rank: number | null } | null;
  top: (Person & { rank: number; points: number })[];
  last: null | {
    week: string;
    winner: (Person & { points: number }) | null;
    top: (Person & { rank: number; points: number; omero: number })[];
    mine: { rank: number; points: number; omero: number } | null;
    box: { prizeSol: number; status: "won" | "claimed" | "paid" | "none"; paidTx: string | null } | null;
  };
};

const LABEL: Record<Activity, string> = {
  trade: T("Trade on OM"), bet: T("Prediction bet"), post: T("Post"), article: T("Article"),
  bag: T("Chill your bag"), reply: T("Reply"), tip: T("Tip a post"), launch: T("Launch a token"),
};
const ORDER: Activity[] = ["trade", "bet", "launch", "article", "bag", "post", "tip", "reply"];

function Avatar({ p, size = "size-9" }: { p: Person; size?: string }) {
  const n = p.name ?? shortAddress(p.wallet);
  // eslint-disable-next-line @next/next/no-img-element
  return p.avatar ? <img src={p.avatar} alt="" className={`${size} shrink-0 rounded-full bg-muted object-cover`} />
    : <span className={`${size} flex shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold`}>{n.replace(/^@/, "").slice(0, 1).toUpperCase()}</span>;
}

function useCountdown(end: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  if (!end) return "";
  const ms = Math.max(0, Date.parse(end) - now);
  const d = Math.floor(ms / 86_400_000), h = Math.floor((ms % 86_400_000) / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Le dessin de la box : le couvercle s'envole à l'ouverture. */
function GiftSvg({ opening }: { opening: boolean }) {
  return (
    <svg viewBox="0 0 120 120" className={`size-36 ${opening ? "animate-[wbshake_0.6s_ease-in-out]" : ""}`} aria-hidden>
      <defs><linearGradient id="wb-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff9a5c" /><stop offset="1" stopColor="#e2560f" /></linearGradient></defs>
      <rect x="18" y="52" width="84" height="60" rx="8" fill="url(#wb-g)" />
      <rect x="54" y="52" width="12" height="60" fill="#fff" opacity=".9" />
      <g className={opening ? "animate-[wblid_0.5s_0.55s_ease-out_forwards]" : ""} style={{ transformOrigin: "60px 46px" }}>
        <rect x="12" y="36" width="96" height="20" rx="6" fill="#f26a1b" />
        <rect x="54" y="36" width="12" height="20" fill="#fff" />
        <path d="M60 36c-8-14-26-14-24-4 2 6 14 5 24 4zM60 36c8-14 26-14 24-4-2 6-14 5-24 4z" fill="#fff" />
      </g>
    </svg>
  );
}

const openedKey = (week: string) => `om_wbox_opened_${week}`;
function readOpened(week: string) { try { return localStorage.getItem(openedKey(week)) === "1"; } catch { return false; } }
function saveOpened(week: string) { try { localStorage.setItem(openedKey(week), "1"); } catch { /* stockage indisponible */ } }

function PrizeBox({ week, box, onClaimed }: { week: string; box: NonNullable<NonNullable<Data["last"]>["box"]>; onClaimed: () => void }) {
  const { tr } = useT();
  const [stage, setStage] = useState<"closed" | "opening" | "open">(() => (box.status !== "won" || readOpened(week) ? "open" : "closed"));
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState(false);

  function open() {
    setStage("opening");
    saveOpened(week);
    setTimeout(() => setStage("open"), 1100);
  }
  async function claim() {
    setBusy(true);
    try {
      const r = await fetch("/api/weekly-box/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ week }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not claim right now");
      toast.success(tr("Claimed. We will send your SOL soon."));
      onClaimed();
    } catch (e) { toast.error(tr((e as Error).message)); }
    setBusy(false);
  }

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-border bg-card p-5">
      <div className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,140,60,0.35),transparent)]" />
      <p className="relative text-center text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">{tr("You won last week's box")}</p>
      <div className="relative flex h-44 items-center justify-center">
        {stage !== "open" ? <GiftSvg opening={stage === "opening"} /> : (
          <div className="flex flex-col items-center gap-1 animate-in zoom-in-50 fade-in duration-500">
            <div className="flex items-center gap-3 whitespace-nowrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/solana.png" alt="" className="size-11 rounded-full" />
              <span className="num text-[42px] font-extrabold tracking-tight text-foreground">{box.prizeSol} SOL</span>
            </div>
            <span className="text-[13px] font-semibold text-muted-foreground">{tr("This week's prize")}</span>
          </div>
        )}
      </div>
      <div className="relative space-y-2">
        {stage === "closed" && <button onClick={open} className="h-12 w-full rounded-full bg-foreground text-[16px] font-bold text-background">{tr("Open my box")}</button>}
        {stage === "open" && box.status === "won" && (
          <button onClick={claim} disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[16px] font-bold text-background disabled:opacity-50">
            {busy && <Loader2 className="size-4 animate-spin" />}{tr("Claim")}
          </button>
        )}
        {stage === "open" && box.status === "claimed" && (
          <div className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-muted text-[15px] font-bold text-foreground"><Check className="size-4" />{tr("Payment on the way")}</div>
        )}
        {stage === "open" && box.status === "paid" && (
          <a href={box.paidTx ? `https://solscan.io/tx/${box.paidTx}` : undefined} target="_blank" rel="noopener noreferrer"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-muted text-[15px] font-bold text-foreground"><Check className="size-4" />{tr("Paid")}</a>
        )}
        {stage === "open" && (
          <button onClick={() => setShare(true)} className="h-12 w-full rounded-full bg-muted text-[15px] font-bold text-foreground">{tr("Share my win")}</button>
        )}
      </div>
      <ShareSheet open={share} onClose={() => setShare(false)} images={[`/api/og/box?week=${week}`]}
        text={tr("I won the OMdotfun weekly box: {n} SOL. Trade, post and win every week.", { n: box.prizeSol })} url="/dashboard/box" />
    </div>
  );
}

export function WeeklyBox() {
  const { tr } = useT();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState(false);
  const load = useCallback(() => {
    fetch("/api/weekly-box", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject())).then(setD).catch(() => setErr(true));
  }, []);
  useEffect(load, [load]);
  const left = useCountdown(d?.week.end);

  if (err) return <p className="py-12 text-center text-sm text-muted-foreground">{tr("Could not load the weekly box")}</p>;
  if (!d) return <div className="flex justify-center py-12"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;

  const c = d.me?.counts ?? {};
  const traded = (c.trade ?? 0) + (c.bet ?? 0) > 0;
  const posted = (c.post ?? 0) + (c.article ?? 0) + (c.bag ?? 0) > 0;
  const chip = (ok: boolean, label: string) => (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-semibold ${ok ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>
      {ok && <Check className="size-3" />}{tr(label)}
    </span>
  );

  return (
    <div className="space-y-4">
      <style>{`@keyframes wbshake{0%,100%{transform:rotate(0)}20%{transform:rotate(-7deg)}40%{transform:rotate(7deg)}60%{transform:rotate(-5deg)}80%{transform:rotate(5deg)}}
@keyframes wblid{to{transform:translate(10px,-60px) rotate(20deg);opacity:0}}`}</style>

      {d.last?.box && d.last.box.status !== "none" && <PrizeBox week={d.last.week} box={d.last.box} onClaimed={load} />}

      {d.last?.mine && !d.last.box && (
        <div className="rounded-[22px] border border-border bg-card p-4 text-[14px]">
          <span className="font-bold">{tr("Last week: rank #{n}", { n: d.last.mine.rank })}</span>
          <span className="text-muted-foreground"> · {tr("{n} OMERO credited", { n: d.last.mine.omero.toLocaleString() })}</span>
        </div>
      )}

      {/* Mon score */}
      <div className="rounded-[28px] border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{tr("Your score this week")}</span>
          <span className="whitespace-nowrap text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{tr("Draw in {t}", { t: left })}</span>
        </div>
        <div className="mt-1 flex items-end justify-between">
          <span className="num text-[44px] font-extrabold leading-none tracking-tight">{(d.me?.points ?? 0).toLocaleString()}</span>
          <span className="num text-[26px] font-extrabold">{d.me?.rank ? `#${d.me.rank}` : "-"}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chip(traded, "Trade")}{chip(posted, "Post")}
          <span className="whitespace-nowrap rounded-full bg-primary/10 px-3 py-1 text-[12px] font-semibold text-primary">{tr("Prize {n} SOL", { n: d.rules.prizeSol })}</span>
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground">
          {!d.me ? tr("Connect your wallet to take part.")
            : !(traded && posted) ? tr("Trade and post at least once this week to enter the ranking.")
            : tr("The top {n} get their points as OMERO. Number 1 also wins {s} SOL.", { n: d.rules.topN, s: d.rules.prizeSol })}
        </p>
      </div>

      {/* Comment gagner des points */}
      <div className="rounded-[28px] border border-border bg-card p-5">
        <p className="mb-2 text-[16px] font-bold">{tr("Earn points")}</p>
        <div className="divide-y divide-border">
          {ORDER.map((k) => (
            <div key={k} className="flex items-center justify-between py-2.5 text-[14px]">
              <span className="font-semibold">{tr(LABEL[k])}</span>
              <span className="flex items-center gap-3">
                <span className="text-[12px] text-muted-foreground">{tr("max {n} a day", { n: d.rules.caps[k] })}{c[k] ? ` · ${tr("{n} this week", { n: c[k] })}` : ""}</span>
                <span className="num w-10 text-right font-bold text-primary">+{d.rules.points[k]}</span>
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">{tr("1 point = 1 OMERO for the top {n}, credited automatically every Monday.", { n: d.rules.topN })}</p>
      </div>

      {/* Top 10 de la semaine */}
      <div className="rounded-[28px] border border-border bg-card p-5">
        <p className="mb-2 text-[16px] font-bold">{tr("Top {n} this week", { n: d.rules.topN })}</p>
        {d.top.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">{tr("No one yet. Be the first.")}</p> : (
          <div className="space-y-1">
            {d.top.map((p) => (
              <Link key={p.wallet} href={`/profile/${p.wallet}`} className="flex items-center gap-3 rounded-2xl px-1 py-2 hover:bg-muted/50">
                <span className="num w-6 text-center text-[14px] font-bold text-muted-foreground">{p.rank}</span>
                <Avatar p={p} />
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{p.name ?? shortAddress(p.wallet)}</span>
                <span className="num text-[15px] font-bold">{p.points.toLocaleString()}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {d.last?.winner && (
        <div className="flex items-center gap-3 rounded-[22px] border border-border bg-card p-4">
          <Avatar p={d.last.winner} />
          <p className="min-w-0 flex-1 text-[14px]">
            <span className="text-muted-foreground">{tr("Last week's winner")} </span>
            <span className="font-bold">{d.last.winner.name ?? shortAddress(d.last.winner.wallet)}</span>
          </p>
          <span className="num text-[14px] font-bold">{d.last.winner.points?.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}
