"use client";

/** Fiche d'une app Discover : en-tête, bouton Ouvrir, paiement en token, images, à propos, notes et avis, apps similaires. */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArcMark, SolanaMark } from "@/components/shared/solana-mark";
import { ArrowLeft, BadgeCheck, Flag, MoreVertical, Rocket, Share2, Star, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { shortAddress } from "@/lib/format";
import { APP_CATEGORY_LABEL, BOOST_COST_OMERO, BOOST_DAYS, REPORT_REASONS, REPORT_REASON_LABEL } from "@/lib/discover";
import { LOCALES } from "@/lib/i18n-mark";
import { ShareSheet, XIcon, TgIcon, DiscordIcon } from "@/components/shared/share-sheet";
import { MiniPriceChart, type Trend } from "@/components/launchpad/mini-price-chart";
import { Mirage } from "@/components/shared/mirage";
import { AppIcon, NameMarks, Rating, compact, visit, type AppCard } from "@/components/discover/app-bits";

type Detail = {
  app: AppCard & { socials?: { x: string | null; telegram: string | null; discord: string | null }; description: string; screenshots: string[]; paymentNote: string | null; owner: { wallet: string; name: string | null } };
  bars: { star: number; count: number; pct: number }[];
  reviews: { wallet: string; name: string | null; avatar: string | null; rating: number; body: string | null; at: string }[];
  mine: { rating: number; body: string | null } | null;
  isOwner: boolean;
  isAdmin?: boolean;
  similar: AppCard[];
};

const usd = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return "-";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
};
const price = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n) || n <= 0) return "-";
  if (n >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
  // Petits prix : 0.0₅123 (zéros comptés), lisible en petit
  const s = n.toFixed(20).split(".")[1] ?? "";
  const zeros = s.match(/^0*/)?.[0].length ?? 0;
  return zeros >= 4 ? `$0.0${String(zeros).split("").map((d) => "₀₁₂₃₄₅₆₇₈₉"[+d]).join("")}${s.slice(zeros, zeros + 3)}` : `$${n.toPrecision(3)}`;
};

/** Valeur du token du projet : prix, capitalisation, volume 24 h et courbe des dernières 24 h. */
function TokenValue({ a, paymentNote }: { a: AppCard; paymentNote: string }) {
  const { tr } = useT();
  const [trend, setTrend] = useState<Trend>("flat");
  const t = a.token;
  return (
    <section className="rounded-[24px] border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {t.logo ? <img src={t.logo} alt="" className="size-11 shrink-0 rounded-full object-cover" /> : <span className="size-11 shrink-0 rounded-full bg-muted" />}
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-2"><span className="num text-[26px] font-extrabold leading-tight">{price(t.price)}</span><span className="text-[14px] font-bold">${t.ticker}</span></p>
        </div>
        <span className={`num shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold ${trend === "up" ? "bg-up/15 text-up" : trend === "down" ? "bg-down/15 text-down" : "bg-muted text-muted-foreground"}`}>24h</span>
      </div>
      <MiniPriceChart chain={t.chain === "arc" ? "arc" : "solana"} pool={t.pool} mint={t.mint} curve={t.curve} className="mt-3 h-20 w-full" onTrend={setTrend} />
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-2xl bg-muted/50 px-3 py-2.5"><p className="num text-[16px] font-bold">{usd(t.mcap)}</p><p className="text-[12px] text-muted-foreground">{tr("Market cap")}</p></div>
        <div className="rounded-2xl bg-muted/50 px-3 py-2.5"><p className="num text-[16px] font-bold">{usd(t.volume24h)}</p><p className="text-[12px] text-muted-foreground">{tr("Volume 24h")}</p></div>
        <div className="col-span-2 rounded-2xl bg-muted/50 px-3 py-2.5 sm:col-span-1"><p className="flex items-center gap-1.5 text-[16px] font-bold">{t.chain === "arc" ? <ArcMark className="size-4" /> : <SolanaMark className="size-4" />}{t.chain === "arc" ? "Arc" : "Solana"}</p><p className="text-[12px] text-muted-foreground">{tr("Network")}</p></div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link href={`/launchpad/${t.slug}`} className="flex h-11 items-center justify-center rounded-full bg-foreground text-[15px] font-bold text-background">{tr("Buy")} ${t.ticker}</Link>
        <Link href={`/launchpad/${t.slug}`} className="flex h-11 items-center justify-center rounded-full bg-muted text-[15px] font-bold">{tr("See the chart")}</Link>
      </div>
      {/* Paiement dans le token (les avertissements sont en bas de la page) */}
      <div className="mt-4 space-y-1.5 border-t border-border pt-3 text-[11.5px] leading-snug text-muted-foreground">
        <p><span className="font-semibold text-foreground">{tr("Payments on this website use ${t}", { t: t.ticker })}.</span> {paymentNote}</p>
      </div>
    </section>
  );
}

/** Logo de blockchain monochrome, sans fond ni bulle : prend la couleur du texte (blanc ou noir selon le thème), comme sur le launchpad. */
function ChainMark({ id, className = "size-4" }: { id: string; className?: string }) {
  const src = id === "arc" ? "/arc-mark.png" : id === "solana" ? "/solana-mark.png" : `/chains/mono/${id}.png`;
  return <span role="img" aria-label={id} className={`inline-block shrink-0 bg-current ${className}`} style={{ WebkitMaskImage: `url(${src})`, maskImage: `url(${src})`, WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskPosition: "center", maskPosition: "center" }} />;
}

/** Réseau d'une fiche sans token (ou de l'admin) : cours du SOL pour Solana, de l'USDC pour Arc, sur 24 h. */
const NET_COIN: Record<string, { symbol: string; ticker: string; logo: string; label: string; href: string }> = {
  // Un appui ouvre le Terminal pour trader (SOL : sa page avec swap et ordres limités ; Arc : la liste des tokens Arc)
  solana: { symbol: "SOLUSDT", ticker: "SOL", logo: "/chains/solana.png", label: "Solana", href: "/terminal?mint=So11111111111111111111111111111111111111112" },
  arc: { symbol: "USDCUSDT", ticker: "USDC", logo: "/usdc-coin.png", label: "Arc", href: "/terminal?chains=arc" },
};
function NetworkValue({ network }: { network: string }) {
  const { tr } = useT();
  const c = NET_COIN[network];
  const [pts, setPts] = useState<number[] | null>(null);
  useEffect(() => {
    if (!c) return;
    let off = false;
    fetch(`/api/crypto/klines?symbol=${c.symbol}&interval=1h&limit=24`).then((r) => (r.ok ? r.json() : [])).then((j: { price: number }[]) => { if (!off) setPts(Array.isArray(j) ? j.map((k) => k.price).filter((n) => n > 0) : []); }).catch(() => { if (!off) setPts([]); });
    return () => { off = true; };
  }, [c]);
  if (!c) return null;
  const last = pts?.length ? pts[pts.length - 1] : null;
  const chg = pts && pts.length > 1 ? ((pts[pts.length - 1] - pts[0]) / pts[0]) * 100 : null;
  const tone = chg == null || Math.abs(chg) < 0.005 ? "bg-muted text-muted-foreground" : chg > 0 ? "bg-up/15 text-up" : "bg-down/15 text-down";
  return (
    <Link href={c.href} className="block rounded-[24px] border border-border bg-card p-4 transition-colors hover:bg-muted/40 sm:p-5">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <span className="flex size-11 shrink-0 items-center justify-center text-foreground">{network === "arc" ? <ArcMark className="size-9" /> : <SolanaMark className="size-9" />}</span>
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-2"><span className="num text-[26px] font-extrabold leading-tight">{last == null ? "-" : `$${last.toLocaleString(undefined, { minimumFractionDigits: last < 10 ? 4 : 2, maximumFractionDigits: last < 10 ? 4 : 2 })}`}</span><span className="text-[14px] font-bold">{c.ticker}</span></p>
          <p className="text-[12px] text-muted-foreground">{tr("Network")}: {c.label}</p>
        </div>
        <span className={`num shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold ${tone}`}>{chg == null ? "24h" : `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`}</span>
      </div>
      <MiniPriceChart chain="" data={pts} className="mt-3 h-20 w-full" />
    </Link>
  );
}

/** Liens X, Telegram et Discord du projet, s'il les a donnés. */
function Socials({ s }: { s?: { x: string | null; telegram: string | null; discord: string | null } }) {
  if (!s || (!s.x && !s.telegram && !s.discord)) return null;
  const btn = "flex size-9 items-center justify-center text-foreground transition-opacity hover:opacity-70";
  return (
    <div className="flex items-center gap-1">
      {s.x && <a href={s.x} target="_blank" rel="noopener noreferrer nofollow" aria-label="X" className={btn}><XIcon /></a>}
      {s.telegram && <a href={s.telegram} target="_blank" rel="noopener noreferrer nofollow" aria-label="Telegram" className={btn}><TgIcon /></a>}
      {s.discord && <a href={s.discord} target="_blank" rel="noopener noreferrer nofollow" aria-label="Discord" className={btn}><DiscordIcon /></a>}
    </div>
  );
}

/** Boost du propriétaire : sa fiche passe dans « Recommandés » pour quelques jours, payé en Omero uniquement. */
function BoostButton({ id, until, onDone }: { id: string; until: string | null; onDone: () => void }) {
  const { tr, lang } = useT();
  const [busy, setBusy] = useState(false);
  const active = until && new Date(until).getTime() > Date.now();
  const go = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/discover/apps/${id}/boost`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(tr(j.error ?? "Could not boost right now")); return; }
      toast.success(tr("Boosted: your project is in Recommended"));
      onDone();
    } finally { setBusy(false); }
  };
  return (
    <button onClick={go} disabled={busy} className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-border text-[15px] font-bold transition-colors hover:bg-muted disabled:opacity-50">
      {busy ? <Mirage className="size-4" /> : <Rocket className="size-4" />}
      {active
        ? tr("Boosted until {date} · extend for {n} Omero", { date: new Date(until!).toLocaleDateString(LOCALES[lang], { day: "numeric", month: "short" }), n: BOOST_COST_OMERO })
        : tr("Boost for {n} Omero · {d} days", { n: BOOST_COST_OMERO, d: BOOST_DAYS })}
    </button>
  );
}

function Stars({ n, size = "size-4" }: { n: number; size?: string }) {
  return <span className="inline-flex gap-0.5">{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`${size} ${i <= Math.round(n) ? "fill-foreground text-foreground" : "text-muted-foreground/40"}`} />)}</span>;
}

export function AppDetail({ id }: { id: string }) {
  const { tr } = useT();
  const { isAuthenticated } = useAuth();
  const [d, setD] = useState<Detail | null>(null);
  const [missing, setMissing] = useState(false);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [shot, setShot] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [share, setShare] = useState(false);
  const [report, setReport] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    fetch(`/api/discover/apps/${id}`, { cache: "no-store" }).then(async (r) => {
      if (!r.ok) { setMissing(true); return; }
      const j = (await r.json()) as Detail;
      setD(j);
      if (j.mine) { setRating(j.mine.rating); setBody(j.mine.body ?? ""); }
    }).catch(() => setMissing(true));
  }, [id]);
  useEffect(load, [load]);

  /** Admin : donne ou retire la puce bleue du projet. */
  async function toggleVerified() {
    if (!d) return;
    const next = !d.app.verified;
    try {
      const r = await fetch(`/api/discover/apps/${id}/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verified: next }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Could not update right now");
      toast.success(next ? tr("Blue badge given") : tr("Blue badge removed"));
      load();
    } catch (e) { toast.error(tr((e as Error).message)); }
  }

  async function sendReview() {
    if (!isAuthenticated) { window.dispatchEvent(new CustomEvent("open-wallet-connect")); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/discover/apps/${id}/reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating, body }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Could not save your review");
      toast.success(tr("Thanks for your review"));
      load();
    } catch (e) { toast.error(tr((e as Error).message)); }
    setBusy(false);
  }

  if (missing) return <p className="py-20 text-center text-muted-foreground">{tr("This project is not available.")}</p>;
  if (!d) return <div className="flex justify-center py-20"><Mirage className="size-5 text-muted-foreground" /></div>;
  const a = d.app;
  const cat = tr(APP_CATEGORY_LABEL[a.category as keyof typeof APP_CATEGORY_LABEL] ?? "Other");
  const images = a.screenshots.length ? a.screenshots : a.banner ? [a.banner] : [];

  return (
    <div>
      {/* Image du projet en haut, qui s'estompe vers la page (comme un store) */}
      <div className="relative">
        <div className="relative h-[180px] overflow-hidden sm:h-[240px] lg:h-[300px] lg:rounded-b-[32px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {a.banner && <img src={a.banner} alt="" className="size-full object-cover opacity-70" />}
          <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/50 to-background" />
        </div>
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-2 pt-2 sm:px-4">
          <Link href="/discover" aria-label={tr("Back")} className="flex size-11 items-center justify-center rounded-full bg-background/60 backdrop-blur hover:bg-background/80"><ArrowLeft className="size-5" /></Link>
          <div className="relative flex items-center gap-1">
            <Socials s={a.socials} />
            <button onClick={() => setMenu((v) => !v)} aria-label={tr("More")} className="flex size-11 items-center justify-center rounded-full bg-background/60 backdrop-blur hover:bg-background/80"><MoreVertical className="size-5" /></button>
            {menu && (
              <div className="absolute right-0 top-12 z-20 w-48 overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
                <button onClick={() => { setMenu(false); setShare(true); }} className="flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] hover:bg-muted"><Share2 className="size-4" />{tr("Share")}</button>
                {d.isAdmin && <button onClick={() => { setMenu(false); toggleVerified(); }} className="flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] hover:bg-muted"><BadgeCheck className="size-4 text-[#34a4f1]" />{a.verified ? tr("Remove blue badge") : tr("Give blue badge")}</button>}
                {!d.isOwner && <button onClick={() => { setMenu(false); if (!isAuthenticated) { window.dispatchEvent(new CustomEvent("open-wallet-connect")); return; } setReport(true); }} className="flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] text-down hover:bg-muted"><Flag className="size-4" />{tr("Report")}</button>}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="relative -mt-24 space-y-7 px-4 sm:-mt-28 sm:px-6 lg:-mt-32 lg:px-8">
      {/* En-tête */}
      <div className="lg:grid lg:grid-cols-[1fr_340px] lg:items-end lg:gap-8">
        <div>
          <Link href={`/profile/${a.owner.wallet}`} className="text-[14px] font-semibold text-primary">{a.owner.name ?? shortAddress(a.owner.wallet)}</Link>
          <div className="mt-1 flex items-start gap-4">
            <h1 className="min-w-0 flex-1 text-[32px] font-bold leading-[1.1] tracking-tight text-foreground sm:text-[40px] lg:text-[48px]">{a.name} <NameMarks app={a} size="size-6 sm:size-7 lg:size-8" /></h1>
            <AppIcon app={a} className="size-20 sm:size-24 lg:hidden" />
          </div>
          <p className="mt-1 break-words text-[15px] text-muted-foreground">{a.tagline}</p>
          <div className="mt-4 flex divide-x divide-border text-center">
            <div className="flex-1 px-2 sm:flex-none sm:pr-6 sm:text-left"><p className="num flex items-center justify-center gap-1 text-[16px] font-bold sm:justify-start">{a.ratings ? a.rating.toFixed(1) : "-"}<Star className="size-3.5 fill-current" /></p><p className="text-[12px] text-muted-foreground">{tr("{n} reviews", { n: compact(a.ratings) })}</p></div>
            <div className="flex-1 px-2 sm:flex-none sm:px-6 sm:text-left"><p className="num text-[16px] font-bold">{compact(a.visits)}</p><p className="text-[12px] text-muted-foreground">{tr("Visits")}</p></div>
            <div className="flex-1 px-2 sm:flex-none sm:px-6 sm:text-left"><p className="text-[16px] font-bold">{cat}</p><p className="text-[12px] text-muted-foreground">{tr("Category")}</p></div>
            {a.platform || a.noToken
              ? (a.network && a.network !== "other" ? <div className="flex-1 px-2 sm:flex-none sm:pl-6 sm:text-left"><p className="flex items-center justify-center gap-1.5 text-[16px] font-bold sm:justify-start"><ChainMark id={a.network} className="size-4" />{({ solana: "Solana", arc: "Arc", base: "Base", bnb: "BNB Chain", ethereum: "Ethereum" } as Record<string, string>)[a.network] ?? "-"}</p><p className="text-[12px] text-muted-foreground">{tr("Network")}</p></div> : null)
              : <Link href={`/launchpad/${a.token.slug}`} className="flex-1 px-2 sm:flex-none sm:pl-6 sm:text-left"><p className="text-[16px] font-bold">${a.token.ticker}</p><p className="text-[12px] text-muted-foreground">{tr("Its token")}</p></Link>}
          </div>
        </div>
        <div className="mt-5 lg:mt-0">
          <AppIcon app={a} className="mb-4 hidden size-28 lg:block" />
          <a href={a.siteUrl} target="_blank" rel="noopener noreferrer" onClick={() => visit(a.id)} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[16px] font-bold text-background transition-opacity hover:opacity-90">{tr("Open website")}</a>
          {d.isOwner && <BoostButton id={a.id} until={a.boostedUntil ?? null} onDone={load} />}
        </div>
      </div>

      {!a.platform && !a.noToken && <TokenValue a={a} paymentNote={a.paymentNote ?? ""} />}
      {(a.platform || a.noToken) && a.network && NET_COIN[a.network] && <NetworkValue network={a.network} />}

      {/* Images */}
      {images.length > 0 && (
        <div className="-mx-4 flex snap-x scroll-pl-4 gap-3 overflow-x-auto scrollbar-none px-4 sm:-mx-6 sm:scroll-pl-6 sm:px-6 lg:mx-0 lg:px-0">
          {images.map((src) => (
            <button key={src} onClick={() => setShot(src)} className="h-[220px] shrink-0 snap-start overflow-hidden rounded-[18px] bg-muted sm:h-[280px] lg:h-[340px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-auto object-cover" />
            </button>
          ))}
        </div>
      )}

      <section>
        <h2 className="text-[19px] font-bold">{tr("About this project")}</h2>
        <p className="mt-2 whitespace-pre-line break-words text-[15px] leading-relaxed text-muted-foreground">{a.description}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-xl border border-border px-3 py-1.5 text-[13px] font-semibold">{cat}</span>
          {a.network && a.network !== "other" && <span className="flex items-center gap-1.5 py-1.5 text-[13px] font-semibold"><ChainMark id={a.network} className="size-4" />{({ solana: "Solana", arc: "Arc", base: "Base", bnb: "BNB Chain", ethereum: "Ethereum" } as Record<string, string>)[a.network]}</span>}
        </div>
      </section>

      {/* Notes et avis */}
      <section>
        <h2 className="text-[19px] font-bold">{tr("Ratings and reviews")}</h2>
        <div className="mt-3 flex items-center gap-5">
          <div className="text-center">
            <p className="num text-[52px] font-semibold leading-none">{a.ratings ? a.rating.toFixed(1) : "-"}</p>
            <Stars n={a.rating} size="size-3.5" />
            <p className="num mt-1 text-[12px] text-muted-foreground">{a.ratings}</p>
          </div>
          <div className="flex-1 space-y-1">
            {d.bars.map((b) => (
              <div key={b.star} className="flex items-center gap-2.5 text-[12px] text-muted-foreground">
                <span className="num w-2">{b.star}</span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-foreground" style={{ width: `${a.ratings ? b.pct : 0}%` }} /></span>
              </div>
            ))}
          </div>
        </div>

        {!d.isOwner && (
          <div className="mt-5 rounded-[22px] border border-border bg-card p-4">
            <p className="text-[15px] font-bold">{d.mine ? tr("Your review") : tr("Rate this project")}</p>
            <div className="mt-2 flex gap-1.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <button key={i} onClick={() => setRating(i)} aria-label={tr("{n} stars", { n: i })}><Star className={`size-8 ${i <= rating ? "fill-foreground text-foreground" : "text-muted-foreground/50"}`} /></button>
              ))}
            </div>
            <textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, 600))} rows={3} placeholder={tr("Describe your experience (optional)")}
              className="mt-3 w-full resize-none rounded-2xl bg-muted px-3.5 py-3 text-[15px] text-foreground outline-none" />
            <button onClick={sendReview} disabled={busy || rating === 0} className="mt-2 flex h-11 w-full items-center justify-center rounded-full bg-foreground text-[15px] font-bold text-background disabled:opacity-40">
              {busy ? <Mirage className="size-4" /> : d.mine ? tr("Update my review") : tr("Publish")}
            </button>
          </div>
        )}

        <div className="mt-4 divide-y divide-border">
          {d.reviews.length === 0 ? <p className="py-4 text-[14px] text-muted-foreground">{tr("No review yet.")}</p> : d.reviews.map((r) => (
            <div key={r.wallet} className="py-4">
              <div className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {r.avatar ? <img src={r.avatar} alt="" className="size-8 rounded-full object-cover" /> : <span className="flex size-8 items-center justify-center rounded-full bg-muted text-[13px] font-bold">{(r.name ?? r.wallet).slice(0, 1).toUpperCase()}</span>}
                <span className="text-[14px] font-semibold">{r.name ?? shortAddress(r.wallet)}</span>
              </div>
              <div className="mt-2 flex items-center gap-2"><Stars n={r.rating} size="size-3" /><span className="text-[12px] text-muted-foreground">{new Date(r.at).toLocaleDateString()}</span></div>
              <p className="mt-1.5 text-[14px] leading-relaxed text-foreground">{r.body}</p>
            </div>
          ))}
        </div>
      </section>

      {d.similar.length > 0 && (
        <section>
          <h2 className="text-[19px] font-bold">{tr("Similar projects")}</h2>
          <div className="-mx-4 mt-3 flex gap-3 overflow-x-auto scrollbar-none px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
            {d.similar.map((s) => (
              <Link key={s.id} href={`/discover/${s.id}`} className="w-[104px] shrink-0">
                <AppIcon app={s} className="size-[104px]" />
                <p className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-tight">{s.name}</p>
                <Rating value={s.rating} count={s.ratings} className="text-[12px] text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Non-responsabilité d'OMdotfun, en bas de la page (pas pour l'app de la plateforme) */}
      {!a.platform && (
        <footer className="space-y-1.5 border-t border-border pb-2 pt-4 text-[11.5px] leading-snug text-muted-foreground">
          <p>{tr("This project is run by its creator, not by OMdotfun. Its listing, rating and token price are never a guarantee and are not financial advice. Crypto can lose all its value: only use what you can afford to lose.")}</p>
          <p className="font-semibold text-foreground">{tr("Never give your recovery phrase (12 or 24 words) to any website. No real project will ask for it. If this site asks for it, report it.")}</p>
        </footer>
      )}

      </div>

      <ShareSheet open={share} onClose={() => setShare(false)} url={`/discover/${a.id}`} text={a.platform || a.noToken ? `${a.name}: ${a.tagline}. On the OM Store.` : `${a.name}: ${a.tagline}. Paid in $${a.token.ticker} on the OM Store.`} images={a.banner ? [a.banner] : []} />

      {report && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-[2px] sm:items-center" onClick={(e) => { if (e.target === e.currentTarget) setReport(false); }}>
          <div role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-[28px] border-t border-border bg-background p-5 sm:rounded-[28px] sm:border">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[18px] font-bold">{tr("Report this project")}</p>
              <button onClick={() => setReport(false)} aria-label={tr("Close")} className="flex size-9 items-center justify-center rounded-full hover:bg-muted"><X className="size-5" /></button>
            </div>
            <div className="space-y-2">
              {REPORT_REASONS.map((r) => (
                <label key={r} className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-[14px] ${reason === r ? "border-foreground" : "border-border"}`}>
                  <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} className="size-4" />{tr(REPORT_REASON_LABEL[r])}
                </label>
              ))}
            </div>
            <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} rows={3} placeholder={tr("Details (optional)")} className="mt-3 w-full resize-none rounded-2xl bg-muted px-3.5 py-3 text-[15px] outline-none" />
            <button disabled={!reason || busy} onClick={async () => {
              setBusy(true);
              try {
                const r = await fetch(`/api/discover/apps/${id}/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, note }) });
                const j = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(j.error ?? "Could not send the report");
                toast.success(tr("Thanks, the team will review this project"));
                setReport(false); setReason(""); setNote("");
              } catch (e) { toast.error(tr((e as Error).message)); }
              setBusy(false);
            }} className="mt-3 h-12 w-full rounded-full bg-foreground text-[15px] font-bold text-background disabled:opacity-40">{tr("Send the report")}</button>
          </div>
        </div>
      )}

      {shot && (
        <button onClick={() => setShot(null)} aria-label={tr("Close")} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot} alt="" className="max-h-full max-w-full rounded-2xl object-contain" />
        </button>
      )}
    </div>
  );
}
