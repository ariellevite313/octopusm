"use client";

/**
 * En-tête du dashboard unifié (wallet, prédictions, lancements) :
 * identité avec le badge de niveau, solde du wallet sur 24 h, trois tuiles (Trader, Déposer, Réclamer)
 * et les onglets en texte. Les gains OM ne sont visibles que par la tuile Réclamer.
 */
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowLeftRight, Check, Copy, HandCoins, RefreshCw, Share2, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { T } from "@/lib/i18n-mark";
import { OctoBadge } from "@/components/leaderboard/octo-tier-badge";
import { ProfileShareSheet } from "@/components/profile/profile-share";
import { WithdrawModal } from "@/components/dashboard/withdraw-modal";
import { WaveTexture } from "@/components/dashboard/creator-fees-dashboard";

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

export function WalletHome({ wallet, name, avatar, octo, active }: { wallet: string; name: string; avatar: string | null; octo: number; active?: string }) {
  const { tr } = useT();
  const router = useRouter();
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

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    const j = <X,>(u: string) => fetch(u, { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<X>) : null)).catch(() => null);
    const [b, s, f] = await Promise.all([
      j<Bags>(`/api/bags${fresh ? "?fresh=1" : ""}`),
      j<Bal>("/api/balance"),
      wallet.startsWith("0x") ? Promise.resolve(null) : j<Fees>(`/api/dashboard/pending-fees?wallet=${encodeURIComponent(wallet)}`),
    ]);
    if (b) setBags(b);
    if (s) setBal(s);
    setFees(f);
    setLoading(false);
  }, [wallet]);
  useEffect(() => { void load(); }, [load]);

  const refresh = () => { void load(true); window.dispatchEvent(new Event(BAGS_REFRESH)); };
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
        {avatar
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={avatar} alt="" className="size-14 shrink-0 rounded-full object-cover" />
          // eslint-disable-next-line @next/next/no-img-element
          : <img src="/omdot-icon.png" alt="" className="size-14 shrink-0 rounded-full bg-muted object-cover p-1.5" />}
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1.5 text-[19px] font-semibold text-foreground"><span className="truncate">{name}</span><OctoBadge totalOcto={octo} size={18} /></p>
          <button onClick={copy} className="num flex items-center gap-1.5 text-[14px] text-muted-foreground hover:text-foreground">
            {short(wallet)} {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </button>
        </div>
        <button onClick={refresh} disabled={loading} aria-label={tr("Refresh")} className="flex size-10 items-center justify-center rounded-full text-foreground hover:bg-muted disabled:opacity-50">
          <RefreshCw className={`size-[22px] ${loading ? "animate-spin" : ""}`} />
        </button>
        <button onClick={() => setShare(true)} aria-label={tr("Share")} className="flex size-10 items-center justify-center rounded-full text-foreground hover:bg-muted"><Share2 className="size-[22px]" /></button>
      </div>

      {/* Solde du wallet */}
      {bags ? (
        <>
          <p className="num relative mt-7 text-[48px] font-bold leading-none tracking-tight text-foreground">${Number(i).toLocaleString("en-US")}<span className="text-muted-foreground">.{d}</span></p>
          <p className="num relative mt-2.5 flex items-center gap-1.5 text-[15px] text-muted-foreground">
            <span className={`text-[11px] ${ch >= 0 ? "text-up" : "text-down"}`}>{ch >= 0 ? "▲" : "▼"}</span>
            {usd2(Math.abs(ch))} ({Math.abs(chPct).toFixed(2)}%)
          </p>
        </>
      ) : (
        <div className="relative mt-7 space-y-2.5"><div className="h-12 w-56 animate-pulse rounded-xl bg-muted" /><div className="h-4 w-32 animate-pulse rounded bg-muted" /></div>
      )}

      {/* Actions */}
      <div className="relative mt-6 flex gap-2">
        <Tile label={tr("Trade")} onClick={() => router.push("/terminal")}><ArrowLeftRight className="size-6" /></Tile>
        <Tile label={tr("Deposit")} onClick={() => setSheet("deposit")}><ArrowDownToLine className="size-6" /></Tile>
        <Tile label={tr("Claim")} badge={claimBadge} onClick={() => setSheet("claim")}><HandCoins className="size-6" /></Tile>
      </div>

      {/* Onglets */}
      <div className="relative -mx-4 mt-7 flex gap-6 overflow-x-auto px-4 [scrollbar-width:none]">
        {TABS.map((t) => {
          const on = t.href === "/dashboard" ? pathname === "/dashboard" : pathname === t.href || pathname.startsWith(t.href + "/");
          return <Link key={t.href} href={t.href} className={`shrink-0 text-[18px] font-semibold transition-colors ${on ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{tr(t.label)}</Link>;
        })}
      </div>

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
    </div>
  );
}
