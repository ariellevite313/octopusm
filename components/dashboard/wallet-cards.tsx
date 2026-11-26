"use client";

/**
 * Accueil du wallet en cartes empilées (téléphone) : Omero, Solana, USDC, tous les tokens (aux couleurs du wallet connecté)
 * et un ticket par prédiction en cours. On touche une carte : elle sort de la pile, s'illumine et montre ses détails.
 * On glisse une carte vers le haut ou le bas pour changer l'ordre (gardé sur l'appareil).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/providers/auth-provider";
import type { WalletType } from "@/lib/wallet/adapters";

type Bag = { id: string; chain: "solana" | "arc"; symbol: string; name: string; logo: string | null; amount: number; value: number | null; change24h?: number | null; href: string | null };
type Bags = { chain: "solana" | "arc"; main: Bag[]; small: Bag[]; total: number; change24h: number };
type Pred = { title: string; slug: string; choice: string; stake: number; token: string; gain: number | null; chance: number | null; closes: string };
type Summary = { omero: { balance: number; total: number; level: string | null; next: string | null; left: number | null; rank: number | null }; predictions: Pred[] };

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const ORDER_KEY = "om-wallet-order";
const TOP = 0, STEP = 76, H = 214;

/** Couleurs et logo de la carte Tokens selon le wallet connecté */
const BRAND: Record<WalletType, { name: string; logo: string; bg: string }> = {
  phantom:     { name: "Phantom",   logo: "/phantom-logo.png",   bg: "radial-gradient(100% 90% at 0% 0%, #b9b0f7 0%, rgba(185,176,247,0) 55%), linear-gradient(160deg, #8f84ea 0%, #4b42a8 100%)" },
  solflare:    { name: "Solflare",  logo: "/solflare-logo.png",  bg: "radial-gradient(100% 90% at 0% 0%, #ffe27a 0%, rgba(255,226,122,0) 55%), linear-gradient(160deg, #f5b700 0%, #c4520e 100%)" },
  backpack:    { name: "Backpack",  logo: "/backpack-logo.png",  bg: "radial-gradient(100% 90% at 0% 0%, #ff8a80 0%, rgba(255,138,128,0) 55%), linear-gradient(160deg, #e33e3f 0%, #8f1d1f 100%)" },
  trustwallet: { name: "Trust",     logo: "https://trustwallet.com/assets/images/media/assets/TWT.png", bg: "radial-gradient(100% 90% at 0% 0%, #6fa8ff 0%, rgba(111,168,255,0) 55%), linear-gradient(160deg, #0500ff 0%, #02238a 100%)" },
  robinhood:   { name: "Robinhood", logo: "/robinhood-logo.png", bg: "radial-gradient(100% 90% at 0% 0%, #d4ff6b 0%, rgba(212,255,107,0) 55%), linear-gradient(160deg, #3ca200 0%, #155400 100%)" },
  brume:       { name: "Brume",     logo: "/wallets/brume.png",  bg: "radial-gradient(100% 90% at 0% 0%, #5b5b66 0%, rgba(91,91,102,0) 55%), linear-gradient(160deg, #2a2a31 0%, #09090b 100%)" },
  metamask:    { name: "MetaMask",  logo: "/logo-metamask.jpeg", bg: "radial-gradient(100% 90% at 0% 0%, #ffb36b 0%, rgba(255,179,107,0) 55%), linear-gradient(160deg, #f6851b 0%, #a3430b 100%)" },
};

const n2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : n >= 1 ? `${+n.toFixed(2)}` : `${+n.toPrecision(3)}`);
const int = (n: number) => Math.round(n).toLocaleString("en-US");

function Chip() {
  return (
    <svg className="wc-deco" width="42" height="32" viewBox="0 0 42 32" style={{ left: 18, top: 96 }} aria-hidden>
      <defs><linearGradient id="wc-chip" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f4dc95" /><stop offset=".5" stopColor="#c9a24a" /><stop offset="1" stopColor="#f0d68a" /></linearGradient></defs>
      <rect x="1" y="1" width="40" height="30" rx="6" fill="url(#wc-chip)" stroke="rgba(0,0,0,.25)" />
      <path d="M1 11h12M1 21h12M29 11h12M29 21h12M13 1v30M29 1v30M13 16h16" stroke="rgba(80,55,10,.45)" fill="none" />
    </svg>
  );
}
function Head({ logo, label, right, round = true }: { logo: string; label: React.ReactNode; right: React.ReactNode; round?: boolean }) {
  return (
    <div className="flex h-[30px] items-center justify-between">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <span className="flex items-center gap-2 text-[16px] font-bold"><img src={logo} alt="" className={`size-[26px] object-cover ${round ? "rounded-full" : "rounded-[7px]"}`} />{label}</span>
      <span className="num text-[16px] font-bold">{right}</span>
    </div>
  );
}

type Card = { key: string; label: string; node: React.ReactNode; details: { rows: [string, string][]; actions: { label: string; href?: string; onClick?: () => void }[] } };

export function WalletCards({ wallet, onDeposit, refreshKey = 0 }: { wallet: string; onDeposit: () => void; refreshKey?: number }) {
  const { tr } = useT();
  const { walletType } = useAuth();
  const [bags, setBags] = useState<Bags | null>(null);
  const [sum, setSum] = useState<Summary | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ key: string; dy: number } | null>(null);
  const startY = useRef(0);
  const moved = useRef(false);

  const load = useCallback(() => {
    const j = <X,>(u: string) => fetch(u, { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<X>) : null)).catch(() => null);
    j<Bags>("/api/bags").then((b) => b && setBags(b));
    j<Summary>("/api/wallet/summary").then((s) => s && setSum(s));
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => { try { const o = JSON.parse(localStorage.getItem(ORDER_KEY) ?? "[]"); if (Array.isArray(o)) setOrder(o); } catch { /* sans effet */ } }, []);

  const arc = wallet.startsWith("0x");
  const all = [...(bags?.main ?? []), ...(bags?.small ?? [])];
  const sol = all.find((b) => b.chain === "solana" && b.id === "native");
  const usdc = arc ? all.find((b) => b.chain === "arc" && b.id === "native") : all.find((b) => b.id === USDC_MINT);
  const tokens = (bags?.main ?? []).filter((b) => b !== sol && b !== usdc && b.amount > 0);
  const tokensTotal = tokens.reduce((s, b) => s + (b.value ?? 0), 0);
  const brand = BRAND[walletType ?? (arc ? "metamask" : "phantom")] ?? BRAND.phantom;
  const om = sum?.omero;

  const cards: Card[] = [];
  cards.push({
    key: "omero", label: "Omero",
    node: (
      <div className="wc-card wc-omero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="wc-deco" src="/profile/omero-peek.png" alt="" style={{ right: -26, bottom: -58, width: 190, opacity: .28, transform: "rotate(-12deg)" }} />
        <Head logo="/octo-coin.png" label="Omero" right={om ? int(om.balance) : "-"} />
        <p className="num mt-[30px] text-[38px] font-extrabold leading-none tracking-tight">{om ? int(om.balance) : "-"} <span className="text-[16px] font-bold opacity-85">OMERO</span></p>
        <div className="mt-[26px] flex gap-[22px] text-[12px]">
          <div><p className="opacity-80">{tr("LEVEL")}</p><p className="mt-0.5 text-[15px] font-bold">{om?.level ? tr(om.level) : "-"}</p></div>
          <div><p className="opacity-80">{tr("RANK")}</p><p className="num mt-0.5 text-[15px] font-bold">{om?.rank ? `#${int(om.rank)}` : "-"}</p></div>
          <div><p className="opacity-80">{tr("NEXT")}</p><p className="num mt-0.5 text-[15px] font-bold">{om?.left != null ? tr("{n} left", { n: int(om.left) }) : "-"}</p></div>
        </div>
      </div>
    ),
    details: {
      rows: [[tr("Balance"), `${int(om?.balance ?? 0)} Omero`], [tr("Total earned"), `${int(om?.total ?? 0)} Omero`], [tr("Level"), om?.level ? tr(om.level) : "-"], [tr("Rank"), om?.rank ? `#${int(om.rank)}` : "-"]],
      actions: [{ label: tr("Levels and animations"), href: `/profile/${wallet}` }],
    },
  });
  if (!arc) cards.push({
    key: "sol", label: "Solana",
    node: (
      <div className="wc-card wc-sol">
        <svg className="wc-deco" width="100%" height="214" viewBox="0 0 358 214" preserveAspectRatio="none" style={{ left: 0, top: 0 }} aria-hidden>
          <defs><linearGradient id="wc-solw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#9945ff" /><stop offset="1" stopColor="#14f195" /></linearGradient></defs>
          <g fill="none" stroke="url(#wc-solw)" strokeWidth="1.2" opacity=".55">
            {[0, 10, 20, 30, 40].map((d) => <path key={d} d={`M-10 ${150 + d} C 60 ${110 + d}, 120 ${190 + d}, 200 ${140 + d} S 330 ${90 + d}, 370 ${120 + d}`} />)}
          </g>
        </svg>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="wc-deco" src="/chains/solana.png" alt="" style={{ right: -30, top: 40, width: 150, height: 150, opacity: .14 }} />
        <Chip />
        <Head logo="/chains/solana.png" label="Solana" right={`${sol ? qty(sol.amount) : "0"} SOL`} />
        <p className="num ml-[58px] mt-[30px] text-[38px] font-extrabold leading-none tracking-tight">${n2(sol?.value ?? 0)}</p>
        <div className="mt-[34px] flex items-center justify-between">
          <p className="wc-emb font-mono text-[15px] font-semibold text-[#d8d8de]">•••• •••• {wallet.slice(-4)}</p>
          {sol?.change24h != null && <span className={`text-[12px] font-bold ${sol.change24h >= 0 ? "text-[#3ddc84]" : "text-[#ff7a6b]"}`}>{sol.change24h >= 0 ? "+" : ""}{sol.change24h.toFixed(2)}% 24h</span>}
        </div>
      </div>
    ),
    details: {
      rows: [[tr("Balance"), `${qty(sol?.amount ?? 0)} SOL`], [tr("Value"), `$${n2(sol?.value ?? 0)}`]],
      actions: [{ label: tr("Deposit"), onClick: onDeposit }, { label: tr("Trade"), href: `/terminal?mint=${SOL_MINT}` }],
    },
  });
  cards.push({
    key: "usdc", label: "USDC",
    node: (
      <div className="wc-card wc-usdc">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="wc-deco" src="/usdc-coin.png" alt="" style={{ right: -40, top: -20, width: 190, height: 190, opacity: .16 }} />
        <Chip />
        <Head logo="/usdc-coin.png" label="USDC" right={usdc ? n2(usdc.amount) : "0.00"} />
        <p className="num ml-[58px] mt-[30px] text-[38px] font-extrabold leading-none tracking-tight">${n2(usdc?.value ?? usdc?.amount ?? 0)}</p>
        <div className="mt-[34px] flex gap-2 text-[12px] font-bold"><span className="rounded-full bg-white/20 px-2.5 py-1">{arc ? "Arc" : "Solana"}</span></div>
      </div>
    ),
    details: {
      rows: [[tr("Balance"), `${n2(usdc?.amount ?? 0)} USDC`], [tr("Network"), arc ? "Arc" : "Solana"]],
      actions: [{ label: tr("Deposit"), onClick: onDeposit }, { label: tr("Predict"), href: "/prediction" }],
    },
  });
  cards.push({
    key: "tokens", label: tr("Tokens"),
    node: (
      <div className="wc-card" style={{ color: "#fff", background: `repeating-radial-gradient(circle at 100% 0%, rgba(255,255,255,.07) 0 1px, transparent 1px 9px), ${brand.bg}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="wc-deco rounded-[28px]" src={brand.logo} alt="" style={{ right: -38, bottom: -44, width: 180, height: 180, opacity: .22, transform: "rotate(-12deg)" }} />
        <Head logo={brand.logo} round={false} label={<>{tr("Tokens")}<span className="text-[12px] font-semibold opacity-80">· {brand.name}</span></>} right={`$${n2(tokensTotal)}`} />
        <div className="mt-4 flex flex-col gap-2.5">
          {tokens.length === 0 && <p className="text-[14px] opacity-85">{tr("No tokens yet")}</p>}
          {tokens.slice(0, 4).map((t) => (
            <div key={t.id} className="flex items-center justify-between text-[14px]">
              <span className="flex min-w-0 items-center gap-2 font-bold">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {t.logo ? <img src={t.logo} alt="" className="size-[22px] rounded-full object-cover" /> : <span className="flex size-[22px] items-center justify-center rounded-full bg-white/25 text-[11px] font-extrabold">{t.symbol.slice(0, 1)}</span>}
                <span className="truncate">${t.symbol}</span><span className="num text-[12px] font-medium opacity-80">{qty(t.amount)}</span>
              </span>
              <span className="num flex items-baseline gap-2">
                <span className="font-bold">${n2(t.value ?? 0)}</span>
                {t.change24h != null && <span className={`text-[12px] font-bold ${t.change24h >= 0 ? "text-[#7dffb0]" : "text-[#ffb3a8]"}`}>{t.change24h >= 0 ? "+" : ""}{t.change24h.toFixed(0)}%</span>}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
    details: {
      rows: tokens.slice(0, 6).map((t) => [`$${t.symbol} · ${qty(t.amount)}`, `$${n2(t.value ?? 0)}`] as [string, string]),
      actions: [{ label: tr("Trade"), href: "/terminal" }],
    },
  });
  (sum?.predictions ?? []).forEach((p, i) => {
    const L = "text-[10px] tracking-[.4px] opacity-85";
    const fin = new Date(p.closes).toLocaleDateString(undefined, { day: "numeric", month: "short" });
    cards.push({
      key: `pred:${p.slug}:${p.choice}`, label: tr("Prediction"),
      node: (
        <div className="wc-card wc-ticket">
          <span className="wc-deco size-[18px] rounded-full bg-background" style={{ left: -9, bottom: 53 }} />
          <span className="wc-deco size-[18px] rounded-full bg-background" style={{ right: -9, bottom: 53 }} />
          <div className="absolute inset-x-4 top-[14px] flex h-[30px] items-center justify-between">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <span className="flex items-center gap-2 text-[16px] font-bold"><img src="/og-logo.png" alt="" className="size-[26px] object-contain" />{tr("Prediction")}{(sum?.predictions.length ?? 0) > 1 && <span className="num text-[12px] opacity-80">{i + 1}/{sum!.predictions.length}</span>}</span>
            <span className="max-w-[45%] truncate rounded-full bg-white px-2.5 py-1 text-[12px] font-extrabold text-black">{p.choice}</span>
          </div>
          <p className="absolute inset-x-4 top-[54px] truncate text-[13px] font-bold">{p.title}</p>
          <div className="absolute inset-x-4 top-[80px] flex items-end justify-between">
            <div><p className={L}>{tr("STAKE")}</p><p className="num text-[24px] font-extrabold leading-tight tracking-tight">{n2(p.stake)} <span className="text-[13px]">{p.token}</span></p></div>
            <svg width="30" height="18" viewBox="0 0 34 20" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="mb-2" aria-hidden><path d="M2 10h28M22 3l8 7-8 7" /></svg>
            <div className="text-right"><p className={L}>{tr("POSSIBLE GAIN")}</p><p className="num text-[24px] font-extrabold leading-tight tracking-tight">{p.gain != null ? n2(p.gain) : "-"} <span className="text-[13px]">{p.token}</span></p></div>
          </div>
          <div className="absolute inset-x-0 bottom-0 flex h-[62px] justify-between border-t-2 border-dashed border-white/45 px-4 pt-3">
            <div><p className={L}>{tr("CHOICE")}</p><p className="mt-0.5 max-w-[110px] truncate text-[14px] font-bold">{p.choice}</p></div>
            <div><p className={L}>{tr("CHANCE")}</p><p className="num mt-0.5 text-[14px] font-bold">{p.chance != null ? `${p.chance}%` : "-"}</p></div>
            <div className="text-right"><p className={L}>{tr("ENDS")}</p><p className="mt-0.5 text-[14px] font-bold">{fin}</p></div>
          </div>
        </div>
      ),
      details: {
        rows: [[tr("Your choice"), p.choice], [tr("Stake"), `${n2(p.stake)} ${p.token}`], [tr("Possible gain"), p.gain != null ? `${n2(p.gain)} ${p.token}` : "-"], [tr("Chance now"), p.chance != null ? `${p.chance}%` : "-"], [tr("Ends"), new Date(p.closes).toLocaleString()]],
        actions: [{ label: tr("See the market"), href: `/pools/${p.slug}` }],
      },
    });
  });

  // Ordre : celui gardé sur l'appareil, puis les cartes nouvelles à la fin
  const keys = cards.map((c) => c.key);
  const ordered = [...order.filter((k) => keys.includes(k)), ...keys.filter((k) => !order.includes(k))];
  const N = ordered.length;
  const openCard = cards.find((c) => c.key === open) ?? null;
  // Carte ouverte : elle seule reste visible, les autres s'effacent (aucun mélange avec les détails)
  const stackH = open ? Math.round(H * 1.03) + 6 : TOP + (N - 1) * STEP + H;

  function save(next: string[]) { setOrder(next); try { localStorage.setItem(ORDER_KEY, JSON.stringify(next)); } catch { /* sans effet */ } }
  function down(key: string, e: React.PointerEvent) {
    if (open) return;
    startY.current = e.clientY; moved.current = false;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* sans effet */ }
    setDrag({ key, dy: 0 });
  }
  function move(key: string, e: React.PointerEvent) {
    if (drag?.key !== key) return;
    const dy = e.clientY - startY.current;
    if (Math.abs(dy) > 6) moved.current = true;
    setDrag({ key, dy });
  }
  function up(key: string) {
    if (drag?.key !== key) return;
    const from = ordered.indexOf(key);
    const to = Math.max(0, Math.min(N - 1, Math.round((from * STEP + drag.dy) / STEP)));
    const next = ordered.slice(); next.splice(from, 1); next.splice(to, 0, key);
    if (to !== from) save(next);
    setDrag(null);
  }
  function tap(key: string) {
    if (moved.current) { moved.current = false; return; }
    setOpen((o) => (o === key ? null : key));
  }

  if (!bags && !sum) return <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-[76px] animate-pulse rounded-[20px] bg-muted" />)}</div>;

  return (
    <div>
      <div className="relative transition-[height] duration-500" style={{ height: stackH }}>
        {ordered.map((key, pos) => {
          const c = cards.find((x) => x.key === key)!;
          const isOpen = open === key;
          const dragging = drag?.key === key;
          let top: number, scale = 1;
          const hidden = !!open && !isOpen;
          if (!open) top = TOP + pos * STEP + (dragging ? drag!.dy : 0);
          else if (isOpen) { top = 3; scale = 1.03; }
          else { top = 40; scale = 0.92; }
          if (dragging) scale = 1.03;
          return (
            <button key={key} type="button" aria-label={c.label} aria-expanded={isOpen}
              onClick={() => tap(key)} onPointerDown={(e) => down(key, e)} onPointerMove={(e) => move(key, e)} onPointerUp={() => up(key)} onPointerCancel={() => up(key)}
              className={`absolute inset-x-0 block h-[214px] w-full touch-none select-none text-left ${hidden ? "pointer-events-none" : ""}`} tabIndex={hidden ? -1 : 0} aria-hidden={hidden || undefined}
              style={{ top, transform: `scale(${scale})`, opacity: hidden ? 0 : 1, zIndex: dragging ? 50 : isOpen ? 40 : pos + 1, transition: dragging ? "transform .2s" : "top .5s cubic-bezier(.22,1,.36,1), transform .5s cubic-bezier(.22,1.3,.36,1), opacity .4s, filter .4s" }}>
              <div className={isOpen ? "wc-lit absolute inset-0 rounded-[20px]" : "absolute inset-0"}>{c.node}</div>
            </button>
          );
        })}
      </div>

      {openCard ? (
        <div className="mt-4 space-y-2">
          {openCard.details.rows.map(([a, b]) => (
            <div key={a} className="flex h-11 items-center justify-between gap-3 rounded-[14px] border border-border bg-card px-3.5">
              <span className="truncate text-[14px] font-semibold">{a}</span><span className="num shrink-0 text-[14px] font-bold">{b}</span>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            {openCard.details.actions.map((a) => a.href
              ? <Link key={a.label} href={a.href} className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-foreground text-[15px] font-bold text-background">{a.label}</Link>
              : <button key={a.label} onClick={a.onClick} className="h-12 flex-1 rounded-2xl bg-foreground text-[15px] font-bold text-background">{a.label}</button>)}
            <button onClick={() => setOpen(null)} aria-label={tr("Close")} className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-muted"><X className="size-5" /></button>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <button onClick={onDeposit} className="h-12 rounded-2xl bg-foreground text-[15px] font-bold text-background">{tr("Deposit")}</button>
          <Link href="/terminal" className="flex h-12 items-center justify-center rounded-2xl border border-border bg-card text-[15px] font-bold">{tr("Trade")}</Link>
          <Link href="/prediction" className="flex h-12 items-center justify-center rounded-2xl border border-border bg-card text-[15px] font-bold">{tr("Predict")}</Link>
        </div>
      )}
    </div>
  );
}
