"use client";

/**
 * En-tête du dashboard unifié (wallet, prédictions, lancements) :
 * identité avec le badge de niveau, solde du wallet sur 24 h, trois tuiles (Trader, Déposer, Réclamer)
 * et les onglets en texte. Les gains OM ne sont visibles que par la tuile Réclamer.
 */
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowLeftRight, Check, Copy, HandCoins, Layers, LayoutList, LogOut, RefreshCw, Share2, X } from "lucide-react";
import { WalletCards } from "@/components/dashboard/wallet-cards";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { disconnectWallet } from "@/lib/wallet/auth";
import { useFiat } from "@/lib/use-fiat";
import { useT } from "@/lib/i18n";
import { T } from "@/lib/i18n-mark";
import { OctoBadge } from "@/components/leaderboard/octo-tier-badge";
import { ProfileShareSheet } from "@/components/profile/profile-share";
import { ProfileEditSheet } from "@/components/dashboard/profile-edit-sheet";
import { WithdrawModal } from "@/components/dashboard/withdraw-modal";
import { WaveTexture } from "@/components/dashboard/creator-fees-dashboard";
import { fetchCached, readCached } from "@/lib/wallet-cache";

// Avant l'affichage (pas de saut entre cartes et classique) ; côté serveur, un simple effet
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type Bags = { total: number; change24h: number };
type Bal = { usdcBalance: number; cltBalance: number; winningsUsdc?: number; referralUsdc?: number };
type Fees = { total: number; tokens: { pending: number }[] };

/** Rafraîchit le solde et la liste des actifs (écouté par BagsPanel) */
export const BAGS_REFRESH = "om-bags-refresh";

const TABS = [
  { label: T("Tokens"),      href: "/dashboard" },
  { label: T("Predictions"), href: "/dashboard/predictions" },
  { label: T("Launches"),    href: "/dashboard/launchpad" },
  { label: T("Gains"),       href: "/dashboard/gains" },
  { label: T("Pools"),       href: "/dashboard/pools" },
  { label: T("Weekly box"),  href: "/dashboard/box" },
  { label: T("Tasks"),       href: "/dashboard/tasks" },
  { label: T("Referrals"),   href: "/dashboard/referrals" },
];

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const usd2 = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const { tr } = useT();
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 md:items-center" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-[28px] border-t border-border bg-background px-5 pb-8 pt-3 md:rounded-[28px] md:border">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[19px] font-bold">{title}</span>
          <button onClick={onClose} aria-label={tr("Close")} className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><X className="size-5" /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function Tile({ label, badge, onClick, children }: { label: string; badge?: string | null; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="relative flex h-[96px] min-w-0 flex-1 flex-col justify-between rounded-[22px] bg-muted p-3 text-left transition-colors hover:bg-muted/70">
      <span className="text-foreground">{children}</span>
      {badge && <span className="num absolute right-2 top-2.5 rounded-full bg-foreground px-2 py-[2px] text-[11px] font-bold text-background">{badge}</span>}
      <span className="whitespace-nowrap text-[14px] font-bold tracking-tight text-foreground">{label}</span>
    </button>
  );
}

export function WalletHome({ wallet, name, avatar, octo, active, children }: { wallet: string; name: string; avatar: string | null; octo: number; active?: string; children?: React.ReactNode }) {
  const { tr } = useT();
  const router = useRouter();
  const { walletType, setWalletType } = useAuth();
  const { code: fiatCode, money } = useFiat();
  const currentPath = usePathname();
  const pathname = active ?? currentPath;
  const [bags, setBags] = useState<Bags | null>(null);
  const [bal, setBal] = useState<Bal | null>(null);
  const [fees, setFees] = useState<Fees | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sheet, setSheet] = useState<"claim" | "deposit" | null>(null);
  const [share, setShare] = useState(false);
  const [withdraw, setWithdraw] = useState<"usdc" | "clawdtrust" | null>(null);
  // Affichage de l'accueil sur téléphone : cartes empilées (par défaut) ou classique. Gardé sur l'appareil.
  const [view, setView] = useState<"cards" | "classic">("cards");
  const [edit, setEdit] = useState(false);
  // Mode cartes (téléphone) : le détail sous les cartes ne s'ouvre qu'en touchant son bouton
  const [more, setMore] = useState(false);
  const [rk, setRk] = useState(0);
  useIsoLayoutEffect(() => { try { if (localStorage.getItem("om-wallet-view") === "classic") setView("classic"); } catch { /* sans effet */ } }, []);
  const switchView = () => { const v = view === "cards" ? "classic" : "cards"; setView(v); try { localStorage.setItem("om-wallet-view", v); } catch { /* sans effet */ } };

  const feesUrl = `/api/dashboard/pending-fees?wallet=${encodeURIComponent(wallet)}`;
  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    const [b, s, f] = await Promise.all([
      fetchCached<Bags>(wallet, `/api/bags${fresh ? "?fresh=1" : ""}`),
      fetchCached<Bal>(wallet, "/api/balance"),
      wallet.startsWith("0x") ? Promise.resolve(null) : fetchCached<Fees>(wallet, feesUrl),
    ]);
    // Un échec garde les valeurs déjà affichées
    if (b) setBags(b);
    if (s) setBal(s);
    if (f) setFees(f);
    setLoading(false);
  }, [wallet, feesUrl]);
  // Dernières valeurs connues tout de suite, puis mise à jour
  useIsoLayoutEffect(() => {
    const b = readCached<Bags>(wallet, "/api/bags"); if (b) setBags(b);
    const s = readCached<Bal>(wallet, "/api/balance"); if (s) setBal(s);
    if (!wallet.startsWith("0x")) { const f = readCached<Fees>(wallet, feesUrl); if (f) setFees(f); }
  }, [wallet, feesUrl]);
  // Mise à jour toutes les 60 s quand la page est visible, et au retour sur l'onglet
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") void load(); };
    const id = setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [load]);
  useEffect(() => { void load(); }, [load]);

  async function disconnect() {
    await disconnectWallet(walletType);
    setWalletType(null);
    toast.success(tr("Disconnected"));
    router.push("/");
  }
  const refresh = () => { void load(true); setRk((x) => x + 1); window.dispatchEvent(new Event(BAGS_REFRESH)); };
  const copy = () => navigator.clipboard.writeText(wallet).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });

  const total = bags?.total ?? 0;
  const [i, d] = total.toFixed(2).split(".");
  const ch = bags?.change24h ?? 0;
  const chPct = total - ch > 0 ? (ch / (total - ch)) * 100 : 0;
  const usdc = bal?.usdcBalance ?? 0;
  const clt = bal?.cltBalance ?? 0;
  const pendingFees = fees?.total ?? 0;
  const feeTokens = (fees?.tokens ?? []).filter((t) => t.pending > 0).length;
  const claimBadge = usdc >= 1 ? `$${Math.floor(usdc)}` : pendingFees > 0 ? `${pendingFees.toFixed(2)} SOL` : null;
  const earned = (bal?.winningsUsdc ?? 0) + (bal?.referralUsdc ?? 0);
  const [ei, ed] = earned.toFixed(2).split(".");

  return (
    <div className="relative">
      <div className="pointer-events-none absolute -inset-x-4 -top-4 h-[420px] overflow-hidden"><WaveTexture /></div>

      {/* Identité */}
      <div className="relative flex items-center gap-3.5">
        {/* On touche la photo ou le nom : modification du profil (photo, noms, niveau, Omero Map) */}
        <button type="button" onClick={() => setEdit(true)} aria-label={tr("Edit profile")} className="shrink-0 rounded-full">
          {avatar
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={avatar} alt="" className="size-14 rounded-full object-cover" />
            // eslint-disable-next-line @next/next/no-img-element
            : <img src="/omdot-icon.png" alt="" className="size-14 rounded-full bg-muted object-cover p-1.5" />}
        </button>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => setEdit(true)} className="flex min-w-0 max-w-full items-center gap-1.5 text-left text-[19px] font-semibold text-foreground"><span className="truncate">{name}</span><OctoBadge totalOcto={octo} size={18} /></button>
          <button onClick={copy} className="num flex items-center gap-1.5 text-[14px] text-muted-foreground hover:text-foreground">
            {short(wallet)} {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </button>
        </div>
        <button onClick={switchView} aria-label={view === "cards" ? tr("Classic view") : tr("Cards view")} title={view === "cards" ? tr("Classic view") : tr("Cards view")} className="flex size-10 items-center justify-center rounded-full text-foreground hover:bg-muted lg:hidden">
          {view === "cards" ? <LayoutList className="size-[22px]" /> : <Layers className="size-[22px]" />}
        </button>
        <button onClick={refresh} disabled={loading} aria-label={tr("Refresh")} className="flex size-10 items-center justify-center rounded-full text-foreground hover:bg-muted disabled:opacity-50">
          <RefreshCw className={`size-[22px] ${loading ? "animate-spin" : ""}`} />
        </button>
        <button onClick={() => setShare(true)} aria-label={tr("Share")} className="flex size-10 items-center justify-center rounded-full text-foreground hover:bg-muted"><Share2 className="size-[22px]" /></button>
        <button onClick={disconnect} aria-label={tr("Disconnect")} className="flex size-10 items-center justify-center rounded-full text-destructive hover:bg-muted"><LogOut className="size-[22px]" /></button>
      </div>

      {/* Téléphone, affichage en cartes */}
      {view === "cards" && <div className="relative mt-6 lg:hidden"><WalletCards wallet={wallet} onDeposit={() => setSheet("deposit")} refreshKey={rk} /></div>}

      <div className={view === "cards" ? "hidden lg:block" : ""}>
      {/* Solde du wallet */}
      {bags ? (
        <>
          <p className="num relative mt-7 text-[48px] font-bold leading-none tracking-tight text-foreground">{fiatCode === "USD" ? <>${Number(i).toLocaleString("en-US")}<span className="text-muted-foreground">.{d}</span></> : money(total)}</p>
          <p className="num relative mt-2.5 flex items-center gap-1.5 text-[15px] text-muted-foreground">
            <span className={`text-[11px] ${ch >= 0 ? "text-up" : "text-down"}`}>{ch >= 0 ? "▲" : "▼"}</span>
            {money(Math.abs(ch))} ({Math.abs(chPct).toFixed(2)}%)
          </p>
        </>
      ) : (
        <div className="relative mt-7 space-y-2.5 pb-[26px]"><div className="h-12 w-56 animate-pulse rounded-xl bg-muted" /><div className="h-4 w-32 animate-pulse rounded bg-muted" /></div>
      )}

      {/* Actions */}
      <div className="relative mt-6 flex gap-2">
        <Tile label={tr("Trade")} onClick={() => router.push("/terminal")}><ArrowLeftRight className="size-6" /></Tile>
        <Tile label={tr("Deposit")} onClick={() => setSheet("deposit")}><ArrowDownToLine className="size-6" /></Tile>
        <Tile label={tr("Claim")} badge={claimBadge} onClick={() => setSheet("claim")}><HandCoins className="size-6" /></Tile>
      </div>

      </div>

      {/* Onglets : en mode cartes, des boutons qui ouvrent le détail (rien d'affiché sous les cartes sans les toucher) */}
      <div className={`relative -mx-4 mt-7 flex overflow-x-auto px-4 [scrollbar-width:none] ${view === "cards" ? "gap-2 lg:gap-6" : "gap-6"}`}>
        {TABS.map((t) => {
          const on = t.href === "/dashboard" ? pathname === "/dashboard" : pathname === t.href || pathname.startsWith(t.href + "/");
          const lit = view === "cards" ? on && (more || pathname !== "/dashboard") : on;
          const cls = view === "cards"
            ? `shrink-0 rounded-full px-4 py-2 text-[15px] font-semibold transition-colors lg:rounded-none lg:bg-transparent lg:px-0 lg:py-0 lg:text-[18px] ${lit ? "bg-foreground text-background lg:text-foreground" : "bg-muted text-foreground lg:text-muted-foreground"}`
            : `shrink-0 text-[18px] font-semibold transition-colors ${on ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`;
          return <Link key={t.href} href={t.href} onClick={(e) => { if (view !== "cards") return; if (on) { e.preventDefault(); setMore((m) => !m); } else setMore(true); }} className={cls}>{tr(t.label)}</Link>;
        })}
      </div>
      {children && <div className={`mt-6 ${view === "cards" && !more && pathname === "/dashboard" ? "hidden lg:block" : ""}`}>{children}</div>}

      {sheet === "deposit" && (
        <Sheet title={tr("Deposit")} onClose={() => setSheet(null)}>
          <p className="text-sm text-muted-foreground">{wallet.startsWith("0x") ? tr("Send USDC on Arc to your wallet address:") : tr("Send SOL or USDC on Solana to your wallet address:")}</p>
          <p className="num mt-3 break-all rounded-2xl bg-muted p-4 text-[14px] font-semibold">{wallet}</p>
          <button onClick={copy} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[15px] font-bold text-background">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? tr("Copied") : tr("Copy address")}
          </button>
        </Sheet>
      )}

      {sheet === "claim" && (
        <Sheet title={tr("Claim")} onClose={() => setSheet(null)}>
          <p className="mt-2 text-[13px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{tr("Earned on OM")}</p>
          <p className="num mt-1 text-[40px] font-bold leading-none tracking-tight">${Number(ei).toLocaleString("en-US")}<span className="text-muted-foreground">.{ed}</span></p>
          <div className="mt-5 divide-y divide-border rounded-2xl border border-border bg-card px-4">
            {([
              [tr("Predictions and pools"), usd2(bal?.winningsUsdc ?? 0)],
              [tr("Referrals and posts"), usd2(bal?.referralUsdc ?? 0)],
              ...(fees ? [[tr("Creator fees ({n} tokens)", { n: feeTokens }), `${Number(pendingFees.toFixed(4))} SOL`]] : []),
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3 py-3 text-[15px]"><span className="text-muted-foreground">{k}</span><span className="num font-semibold text-foreground">{v}</span></div>
            ))}
          </div>
          <button onClick={() => setWithdraw("usdc")} disabled={usdc < 2} className="mt-5 h-14 w-full rounded-full bg-foreground text-[17px] font-bold text-background disabled:opacity-40">
            {tr("Withdraw {amount} USDC", { amount: usd2(usdc) })}
          </button>
          {usdc < 2 && <p className="mt-2 text-center text-[12px] text-muted-foreground">{tr("Minimum withdrawal: $2.00 USDC")}</p>}
          {clt > 0 && (
            <button onClick={() => setWithdraw("clawdtrust")} className="mt-2.5 h-14 w-full rounded-full bg-muted text-[17px] font-bold text-foreground">
              {tr("Withdraw {amount} CLT", { amount: Math.floor(clt).toLocaleString("en-US") })}
            </button>
          )}
          {pendingFees > 0 && (
            <button onClick={() => { setSheet(null); router.push("/dashboard/launchpad?claim=1"); }} className="mt-2.5 h-14 w-full rounded-full bg-muted text-[17px] font-bold text-foreground">
              {tr("Claim {amount} SOL creator fees", { amount: String(Number(pendingFees.toFixed(4))) })}
            </button>
          )}
        </Sheet>
      )}

      {withdraw && (
        <WithdrawModal token={withdraw} balance={withdraw === "usdc" ? usdc : clt} onClose={() => { setWithdraw(null); void load(); }} />
      )}
      <ProfileShareSheet wallet={wallet} name={name} open={share} onClose={() => setShare(false)} />
      <ProfileEditSheet wallet={wallet} open={edit} onClose={() => setEdit(false)} />
    </div>
  );
}
