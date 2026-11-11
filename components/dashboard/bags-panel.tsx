"use client";

/**
 * BAGS : le portefeuille connecté en lecture seule (solde, variation 24 h, actifs du plus gros au plus petit).
 * On peut acheter, vendre et swapper (Solana) ; aucun envoi de fonds depuis OM.
 */
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, ArrowDownRight, ArrowUpRight, Check, ChevronDown, ChevronRight, Copy, Globe, Loader2, Minus, Plus, RefreshCw, Send, Share2, ShoppingCart, Star, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { getWalletProfile } from "@/services/wallet-service";
import { SwapBox } from "@/components/swap/swap-box";
import { TerminalLineChart, T_RANGES, type TRange } from "@/components/terminal/line-chart";
import { WaveTexture } from "./creator-fees-dashboard";
import type { Bag } from "@/lib/bags";

type Data = { chain: "solana" | "arc"; main: Bag[]; small: Bag[]; total: number; change24h: number };

const usd = (n: number) => n >= 1000 ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : n >= 0.01 ? `$${n.toFixed(2)}` : "<$0.01";
const big = (n: number | null) => n == null ? "-" : `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
function qty(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 1) return n.toFixed(2).replace(/\.?0+$/, "");
  return n.toPrecision(3);
}
function price(n: number | null): string {
  if (n == null) return "-";
  if (n >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
  if (n >= 0.0001) return `$${n.toFixed(6).replace(/0+$/, "")}`;
  return `$${n.toPrecision(3)}`;
}
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const swappable = (b: Bag) => b.chain === "solana" && b.id !== "native" && !(b.href ?? "").startsWith("/launchpad/");

function BottomSheet({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  const { tr } = useT();
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 md:items-center" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-[28px] border-t border-border bg-background px-4 pb-8 pt-2 md:rounded-[28px] md:border">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[17px] font-bold">{title}</span>
          <button onClick={onClose} aria-label={tr("Close")} className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><X className="size-5" /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function TokenLogo({ b, size = "size-12" }: { b: Pick<Bag, "logo" | "symbol">; size?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return b.logo ? <img src={b.logo} alt="" loading="lazy" className={`${size} shrink-0 rounded-full bg-muted object-cover`} />
    : <span className={`${size} flex shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground`}>{b.symbol.slice(0, 1)}</span>;
}

export function BagsPanel() {
  const { tr } = useT();
  const router = useRouter();
  const { walletAddress } = useAuth();
  const { data: me } = useQuery({ queryKey: ["wallet-profile", walletAddress], queryFn: () => getWalletProfile(walletAddress!), enabled: !!walletAddress, staleTime: 60_000 });
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSmall, setShowSmall] = useState(false);
  const [open, setOpen] = useState<Bag | null>(null);
  const [sheet, setSheet] = useState<"deposit" | "sell" | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (fresh = false) => {
    setLoading(true); setError(false);
    try {
      const r = await fetch(`/api/bags${fresh ? "?fresh=1" : ""}`, { cache: "no-store" });
      if (!r.ok) throw new Error();
      setData((await r.json()) as Data);
    } catch { setError(true); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const name = me?.display_name ?? me?.username ?? (walletAddress ? short(walletAddress) : "");
  const initials = (name || "OM").replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "OM";
  const total = data?.total ?? 0;
  const [i, d] = total.toFixed(2).split(".");
  const ch = data?.change24h ?? 0;
  const chPct = total - ch > 0 ? (ch / (total - ch)) * 100 : 0;
  const isSol = data?.chain !== "arc";
  const sellable = (data?.main ?? []).filter(swappable);

  const copy = () => walletAddress && navigator.clipboard.writeText(walletAddress).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });

  return (
    <section>
      {/* Carte solde */}
      <div className="relative overflow-hidden rounded-[28px] bg-card p-5 ring-1 ring-border">
        <WaveTexture />
        <div className="relative flex items-center gap-3">
          {me?.avatar_src
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={me.avatar_src} alt="" className="size-12 rounded-full object-cover" />
            : <span className="flex size-12 items-center justify-center rounded-full bg-foreground/10 text-[17px] font-bold text-foreground/80">{initials}</span>}
          <span className="min-w-0 truncate text-[19px] font-semibold text-foreground">{name}</span>
          <button onClick={copy} aria-label={tr("Copy address")} className="shrink-0 text-muted-foreground hover:text-foreground">{copied ? <Check className="size-[18px]" /> : <Copy className="size-[18px]" />}</button>
          <button onClick={() => load(true)} disabled={loading} title={tr("Refresh")} className="ml-auto flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground disabled:opacity-50">
            <RefreshCw className={`size-[18px] ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <p className="relative mt-6 text-[13px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{tr("Balance")}</p>
        <p className="num relative mt-1 text-[52px] font-bold leading-none tracking-tight text-foreground">${Number(i).toLocaleString("en-US")}<span className="text-muted-foreground">.{d}</span></p>
        <p className={`num relative mt-3 text-[15px] ${ch > 0 ? "text-up" : ch < 0 ? "text-down" : "text-muted-foreground"}`}>
          {ch >= 0 ? "+" : "-"}${Math.abs(ch).toFixed(2)} {ch >= 0 ? "+" : "-"}{Math.abs(chPct).toFixed(2)}% <span className="text-muted-foreground">24h</span>
        </p>
      </div>

      {/* Actions : uniquement déposer, swapper, acheter, vendre */}
      <div className="mt-5 grid grid-cols-4 gap-2">
        <Action label={tr("Deposit")} onClick={() => setSheet("deposit")}><Plus className="size-6" /></Action>
        <Action label={tr("Swap")} onClick={() => router.push("/terminal")} disabled={!isSol}><ArrowLeftRight className="size-6" /></Action>
        <Action label={tr("Buy")} onClick={() => router.push("/terminal")} disabled={!isSol}><ShoppingCart className="size-6" /></Action>
        <Action label={tr("Sell")} onClick={() => setSheet("sell")} disabled={!isSol || sellable.length === 0}><Minus className="size-6" /></Action>
      </div>

      {/* Actifs */}
      <h2 className="mt-8 flex items-center gap-1 text-[28px] font-bold tracking-tight text-foreground">{tr("Assets")}<ChevronRight className="size-6" strokeWidth={2.5} /></h2>
      <p className="text-[15px] text-muted-foreground">{data ? `${data.chain === "arc" ? "Arc" : "Solana"} · ${tr("{count} tokens", { count: data.main.length + data.small.length })}` : " "}</p>
      <div className="mt-2">
        {loading && !data ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{tr("Loading")}</div>
        ) : error && !data ? (
          <p className="py-6 text-sm text-muted-foreground">{tr("Could not read the wallet right now")}</p>
        ) : data && data.main.length + data.small.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">{tr("No token in this wallet yet.")}</p>
        ) : data && (
          <>
            {data.main.map((b) => <Row key={`${b.chain}:${b.id}`} b={b} onOpen={setOpen} />)}
            {data.small.length > 0 && (
              <>
                <button onClick={() => setShowSmall((v) => !v)}
                  className="mt-2 flex w-full items-center justify-between rounded-2xl bg-muted/50 px-4 py-3 text-[14px] font-semibold text-muted-foreground hover:text-foreground">
                  <span>{tr("Small balances and unpriced ({count})", { count: data.small.length })}</span>
                  <ChevronDown className={`size-4 transition-transform ${showSmall ? "rotate-180" : ""}`} />
                </button>
                {showSmall && <div className="opacity-70">{data.small.map((b) => <Row key={`${b.chain}:${b.id}`} b={b} onOpen={setOpen} />)}</div>}
              </>
            )}
          </>
        )}
      </div>

      {sheet === "deposit" && walletAddress && (
        <BottomSheet title={tr("Deposit")} onClose={() => setSheet(null)}>
          <p className="text-sm text-muted-foreground">{isSol ? tr("Send SOL or USDC on Solana to your wallet address:") : tr("Send USDC on Arc to your wallet address:")}</p>
          <div className="mt-3 break-all rounded-2xl bg-muted p-4 font-mono text-[14px] text-foreground">{walletAddress}</div>
          <button onClick={copy} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-foreground font-bold text-background">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? tr("Copied") : tr("Copy address")}
          </button>
        </BottomSheet>
      )}
      {sheet === "sell" && (
        <BottomSheet title={tr("Sell")} onClose={() => setSheet(null)}>
          {sellable.map((b) => <Row key={b.id} b={b} onOpen={(x) => { setSheet(null); setOpen(x); }} />)}
        </BottomSheet>
      )}
      {open && <BagDetail b={open} onClose={() => setOpen(null)} onSwapped={() => setTimeout(() => void load(true), 4000)} />}
    </section>
  );
}

function Action({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} className="group flex flex-col items-center gap-2 disabled:opacity-40">
      <span className="flex size-[60px] items-center justify-center rounded-full bg-muted text-foreground transition-colors group-hover:bg-muted/70">{children}</span>
      <span className="text-[14px] font-medium text-foreground">{label}</span>
    </button>
  );
}

function Row({ b, onOpen }: { b: Bag; onOpen: (b: Bag) => void }) {
  const c = b.change24h;
  return (
    <button onClick={() => onOpen(b)} className="flex w-full items-center gap-3 rounded-2xl px-1 py-2.5 text-left hover:bg-muted/40">
      <TokenLogo b={b} size="size-11" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] font-bold text-foreground">{b.name}</p>
        <p className="num truncate text-[13px] text-muted-foreground">{qty(b.amount)} {b.symbol}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="num text-[16px] font-bold text-foreground">{b.value != null ? usd(b.value) : "-"}</p>
        {c != null && <p className={`num text-[12px] font-semibold ${c >= 0 ? "text-up" : "text-down"}`}>{c >= 0 ? "+" : ""}{c.toFixed(2)}%</p>}
      </div>
    </button>
  );
}

// ── Fiche d'un token du portefeuille ──────────────────────────────────────────
type Market = { pool: string | null; price: number | null; change24h: number | null; mcap: number | null; volume24h: number | null; liquidity: number | null; links: { type: string; url: string }[] };
type Act = { sig: string; side: string; base: string; base_amount: number; token_amount: number; at: string };
const FAV_KEY = "om_terminal_favs";

function BagDetail({ b, onClose, onSwapped }: { b: Bag; onClose: () => void; onSwapped: () => void }) {
  const { tr } = useT();
  const [m, setM] = useState<Market | null>(null);
  const [acts, setActs] = useState<Act[]>([]);
  const [range, setRange] = useState<TRange>("7D");
  const [move, setMove] = useState<{ first: number; last: number } | null>(null);
  const [swap, setSwap] = useState<"buy" | "sell" | null>(null);
  const [copied, setCopied] = useState(false);
  const [fav, setFav] = useState(false);
  const isMintBag = b.chain === "solana" && b.id !== "native";
  const canSwap = swappable(b);

  useEffect(() => {
    if (!isMintBag) return;
    fetch(`/api/bags/token?mint=${b.id}`).then((r) => r.json()).then((j) => { setM(j.market ?? null); setActs(j.activity ?? []); }).catch(() => {});
    try { setFav((JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]") as { mint: string }[]).some((x) => x.mint === b.id)); } catch { /* indisponible */ }
  }, [b.id, isMintBag]);
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);
  const onChart = useCallback((first: number, last: number) => setMove({ first, last }), []);

  const livePrice = move?.last ?? m?.price ?? b.price;
  const chg = move && move.first > 0 ? ((move.last - move.first) / move.first) * 100 : m?.change24h ?? b.change24h ?? null;
  const value = livePrice != null ? livePrice * b.amount : b.value;
  const bagChange = b.change24h != null && value != null && b.change24h > -100 ? value - value / (1 + b.change24h / 100) : null;

  const toggleFav = () => {
    try {
      const cur = JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]") as { mint: string }[];
      const next = cur.some((x) => x.mint === b.id) ? cur.filter((x) => x.mint !== b.id)
        : [{ mint: b.id, symbol: b.symbol, name: b.name, logo: b.logo, price: livePrice, change24h: m?.change24h ?? null, volume24h: m?.volume24h ?? null, mcap: m?.mcap ?? null, liquidity: m?.liquidity ?? null, pool: m?.pool ?? "", createdAt: null }, ...cur];
      localStorage.setItem(FAV_KEY, JSON.stringify(next.slice(0, 100)));
      setFav(!fav);
    } catch { /* stockage indisponible */ }
  };
  const share = () => {
    const url = `${location.origin}/terminal?mint=${b.id}`;
    if (navigator.share) navigator.share({ title: `$${b.symbol} on OM`, url }).catch(() => {});
    else navigator.clipboard.writeText(url).then(() => toast.success(tr("Link copied")));
  };
  const linkIcon = (t: string) => t === "website" ? <Globe className="size-4" /> : t === "x" ? <span className="text-[13px] font-black">X</span> : <Send className="size-4" />;
  const linkLabel = (t: string) => t === "website" ? tr("Website") : t === "x" ? "X" : t === "discord" ? "Discord" : "Telegram";

  return createPortal(
    <div className="fixed inset-0 z-[110] overflow-y-auto bg-background">
      <div className="mx-auto max-w-xl pb-36">
        {/* En-tête */}
        <div className="sticky top-0 z-10 flex items-center gap-3 bg-background/95 px-4 py-3 backdrop-blur">
          <button onClick={onClose} aria-label={tr("Close")} className="flex size-10 items-center justify-center rounded-full text-foreground hover:bg-muted"><X className="size-6" /></button>
          <TokenLogo b={b} size="size-10" />
          <span className="min-w-0 flex-1 truncate text-[20px] font-bold text-foreground">{b.name}</span>
          {isMintBag && <button onClick={toggleFav} aria-label={tr("Favorites")} className="flex size-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"><Star className={`size-[22px] ${fav ? "fill-foreground text-foreground" : ""}`} /></button>}
          {isMintBag && <button onClick={share} aria-label={tr("Share")} className="flex size-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"><Share2 className="size-[21px]" /></button>}
        </div>

        {/* Prix */}
        <div className="px-5 pt-3">
          <p className="num text-[40px] font-bold leading-none tracking-tight text-foreground">{price(livePrice)}</p>
          {chg != null && (
            <p className={`num mt-2 flex items-center gap-1 text-[17px] font-semibold ${chg >= 0 ? "text-up" : "text-down"}`}>
              {chg >= 0 ? <ArrowUpRight className="size-5" /> : <ArrowDownRight className="size-5" />}{Math.abs(chg).toFixed(2)}%
            </p>
          )}
        </div>

        {/* Graphique */}
        {m?.pool ? (
          <>
            <div className="mt-4"><TerminalLineChart pool={m.pool} range={range} onChange={onChart} /></div>
            <div className="flex items-center justify-center gap-1 px-4 py-2">
              {T_RANGES.map((r) => (
                <button key={r} onClick={() => setRange(r)} className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold ${range === r ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{r}</button>
              ))}
            </div>
          </>
        ) : <div className="h-6" />}

        {/* Chiffres du marché */}
        {isMintBag && (
          <div className="mt-3 grid grid-cols-3 divide-x divide-border px-2 text-center">
            {([[tr("Market cap"), big(m?.mcap ?? null)], [tr("Volume 24h"), big(m?.volume24h ?? null)], [tr("Liquidity"), big(m?.liquidity ?? null)]] as const).map(([k, v]) => (
              <div key={k} className="px-2"><p className="text-[13px] text-muted-foreground">{k}</p><p className="num mt-1 text-[17px] font-bold text-foreground">{v}</p></div>
            ))}
          </div>
        )}

        {/* Solde et variation */}
        <div className="mt-6 grid grid-cols-2 gap-3 px-4">
          <div className="rounded-3xl bg-card p-4 ring-1 ring-border">
            <p className="text-[15px] font-semibold text-foreground">{tr("Balance")}</p>
            <p className="num mt-3 text-[24px] font-bold text-foreground">{value != null ? usd(value) : "-"}</p>
            <p className="num mt-1 truncate text-[13px] text-muted-foreground">{qty(b.amount)} {b.symbol}</p>
          </div>
          <div className="rounded-3xl bg-card p-4 ring-1 ring-border">
            <p className="text-[15px] font-semibold text-foreground">{tr("24h change")}</p>
            {bagChange != null ? (
              <>
                <p className={`num mt-3 text-[24px] font-bold ${bagChange >= 0 ? "text-up" : "text-down"}`}>{bagChange >= 0 ? "+" : "-"}${Math.abs(bagChange).toFixed(2)}</p>
                <p className={`num mt-1 text-[13px] ${bagChange >= 0 ? "text-up" : "text-down"}`}>{(b.change24h ?? 0) >= 0 ? "+" : ""}{(b.change24h ?? 0).toFixed(2)}%</p>
              </>
            ) : <p className="mt-3 text-[24px] font-bold text-muted-foreground">-</p>}
          </div>
        </div>

        {/* À propos */}
        {isMintBag && (
          <div className="mt-8 px-5">
            <h3 className="text-[26px] font-bold text-foreground">{tr("About")}</h3>
            <div className="mt-4 grid grid-cols-2 divide-x divide-border">
              <div className="pr-4">
                <p className="text-[13px] text-muted-foreground">{tr("Mint address")}</p>
                <button onClick={() => navigator.clipboard.writeText(b.id).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })} className="mt-1 flex items-center gap-1.5 text-[16px] font-semibold text-foreground">
                  {short(b.id)}{copied ? <Check className="size-4" /> : <Copy className="size-4 text-muted-foreground" />}
                </button>
              </div>
              <div className="pl-4">
                <p className="text-[13px] text-muted-foreground">{tr("Ticker")}</p>
                <p className="mt-1 text-[16px] font-semibold text-foreground">{b.symbol}</p>
              </div>
            </div>
            {!!m?.links.length && (
              <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none]">
                {m.links.map((l) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="flex shrink-0 items-center gap-2 rounded-xl bg-muted px-3.5 py-2 text-[14px] font-semibold text-foreground">{linkIcon(l.type)}{linkLabel(l.type)}</a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Activité via OM */}
        {acts.length > 0 && (
          <div className="mt-8 px-5">
            <h3 className="text-[26px] font-bold text-foreground">{tr("Activity")}</h3>
            {acts.map((a) => (
              <a key={a.sig} href={`https://solscan.io/tx/${a.sig}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 py-3">
                <TokenLogo b={b} size="size-11" />
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] font-semibold text-foreground">{a.side === "buy" ? tr("Bought") : tr("Sold")}</p>
                  <p className="truncate text-[13px] text-muted-foreground">{a.side === "buy" ? `${a.base} → ${b.symbol}` : `${b.symbol} → ${a.base}`} · {new Date(a.at).toLocaleDateString()}</p>
                </div>
                <div className="num shrink-0 text-right text-[14px]">
                  <p className="text-foreground">-{a.side === "buy" ? `${qty(a.base_amount)} ${a.base}` : `${qty(a.token_amount)} ${b.symbol}`}</p>
                  <p className="text-up">+{a.side === "buy" ? `${qty(a.token_amount)} ${b.symbol}` : `${qty(a.base_amount)} ${a.base}`}</p>
                </div>
              </a>
            ))}
          </div>
        )}

        {b.href?.startsWith("/launchpad/") && (
          <div className="mt-8 px-5"><Link href={b.href} onClick={onClose} className="flex h-12 items-center justify-center rounded-2xl bg-muted font-semibold text-foreground">{tr("OM token page")}</Link></div>
        )}
      </div>

      {/* Vendre | Acheter */}
      {canSwap && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background px-4 pb-6 pt-3">
          <div className="mx-auto flex max-w-xl gap-3">
            <button onClick={() => setSwap("sell")} className="h-14 flex-1 rounded-full bg-muted text-[18px] font-bold text-foreground">{tr("Sell")}</button>
            <button onClick={() => setSwap("buy")} className="h-14 flex-1 rounded-full bg-foreground text-[18px] font-bold text-background">{tr("Buy")}</button>
          </div>
        </div>
      )}
      {swap && (
        <BottomSheet title={`$${b.symbol}`} onClose={() => setSwap(null)}>
          <SwapBox mint={b.id} initialSide={swap} onSwapped={() => { setSwap(null); onSwapped(); }} />
        </BottomSheet>
      )}
    </div>,
    document.body,
  );
}
