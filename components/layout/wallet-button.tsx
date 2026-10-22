"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { ArrowUpRight, Camera, Check, Copy, History, LayoutDashboard, LogOut, Moon, Pencil, Plus, Rocket, Settings2, Sun, Trophy, User, UserPlus } from "lucide-react";
import { T } from "@/lib/i18n-mark";
import { WithdrawModal } from "@/components/dashboard/withdraw-modal";
import Image from "next/image";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { connectWalletAndAuth, disconnectWallet } from "@/lib/wallet/auth";
import { getAvailableWallets, type WalletType } from "@/lib/wallet/adapters";
import { WalletSelectDialog } from "@/components/wallet/wallet-select-dialog";
import { TokenLogo } from "@/components/shared/token-logo";

const WALLET_ICONS: Record<WalletType, string> = {
  phantom:     "/phantom-logo.png",
  solflare:    "/solflare-logo.png",
  backpack:    "/backpack-logo.png",
  trustwallet: "https://trustwallet.com/assets/images/media/assets/TWT.png",
  robinhood:   "/robinhood-logo.png",
  metamask:    "/logo-metamask.jpeg",
};
import {
  getWalletProfile,
  updateWalletProfile,
  uploadAvatar,
  getPlatformBalances,
  getDrawerStats,
} from "@/services/wallet-service";
import { OCTO_TIERS, getOctoTier } from "@/components/leaderboard/octo-tier-badge";
import { OctoBadge } from "@/components/leaderboard/octo-tier-badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// i18n — see lib/i18n.tsx for full translations

function shortAddr(addr: string) {
  return addr.slice(0, 4) + "..." + addr.slice(-4);
}

function fmtUsd(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtClt(n: number) {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : n.toLocaleString();
}

function RowIcon({ icon: Icon }: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }) {
  return <span className="flex size-11 items-center justify-center rounded-full bg-muted"><Icon className="size-5 text-foreground" strokeWidth={1.8} /></span>;
}

/** Ligne de solde / gain : une carte par ligne, logo rond, valeur à droite. */
function BalanceRow({ logo, name, sub, value, note, href, onNavigate }: {
  logo: React.ReactNode; name: string; sub: string; value: string; note?: string; href?: string; onNavigate?: () => void;
}) {
  const body = (
    <>
      <span className="shrink-0">{logo}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold text-foreground">{name}</span>
        <span className="block truncate text-[13px] text-muted-foreground">{sub}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[15px] font-bold text-foreground">{value}</span>
        {note && <span className="block text-[13px] text-muted-foreground">{note}</span>}
      </span>
    </>
  );
  const cls = "flex items-center gap-3 rounded-[20px] bg-muted/50 px-3.5 py-3";
  return href ? <Link href={href} onClick={onNavigate} className={`${cls} transition-colors hover:bg-muted`}>{body}</Link> : <div className={cls}>{body}</div>;
}

// Profile drawer

export function ProfileDrawer({
  walletAddress,
  open,
  onClose,
  onDisconnect,
}: {
  walletAddress: string;
  open: boolean;
  onClose: () => void;
  onDisconnect: () => void;
}) {
  const { isAdmin } = useAuth();
  const { tr } = useT();
  const { theme, setTheme } = useTheme();
  const [isPhantom, setIsPhantom] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (w.phantom?.solana?.isPhantom || w.solana?.isPhantom) setIsPhantom(true);
  }, []);
  const isDark = theme === "dark";

  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [twitterHandle, setTwitterHandle] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (!showSettings) return;
    function handleClick(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showSettings]);

  const { data: profile } = useQuery({
    queryKey: ["wallet-profile", walletAddress],
    queryFn: () => getWalletProfile(walletAddress),
    staleTime: 60_000,
  });

  const { data: balances = { usdc: 0, clt: 0, octo: 0 } } = useQuery({
    queryKey: ["platform-balances", walletAddress],
    queryFn: () => getPlatformBalances(walletAddress),
    staleTime: 60_000,
  });
  const octoBalance = balances.octo;

  const { data: drawerStats } = useQuery({
    queryKey: ["drawer-stats", walletAddress],
    queryFn: () => getDrawerStats(),
    staleTime: 60_000,
  });

  const [copiedRef, setCopiedRef] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const referralLink = drawerStats?.referral_code
    ? `${origin}/?ref=${drawerStats.referral_code}`
    : null;

  async function copyReferralLink() {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
  }

  // OCTO tier progress
  const currentTier = getOctoTier(octoBalance);
  const tierIndex = currentTier ? OCTO_TIERS.findIndex(t => t.label === currentTier.label) : -1;
  const nextTierObj = tierIndex >= 0 && tierIndex < OCTO_TIERS.length - 1 ? OCTO_TIERS[tierIndex + 1] : null;
  const isMaxTier = tierIndex === OCTO_TIERS.length - 1;
  const octoProgress = (() => {
    if (isMaxTier) return 100;
    if (!currentTier) return Math.min(100, Math.round((octoBalance / 1000) * 100));
    const range = currentTier.max - currentTier.min;
    return Math.min(100, Math.round(((octoBalance - currentTier.min) / range) * 100));
  })();
  const progressColor = currentTier?.color ?? "#f97316";
  void progressColor;
  void octoProgress;

  const cltPrice    = balances.cltPriceUsd ?? 0;
  const cltUsd      = balances.clt * cltPrice;
  const totalUsd    = balances.usdc + cltUsd;
  const change      = balances.change24hUsd ?? 0;
  const changePct   = totalUsd - change > 0 ? (change / (totalUsd - change)) * 100 : 0;
  const winningsUsd = (balances.winningsUsdc ?? 0) + (balances.winningsClt ?? 0) * cltPrice;
  const referralUsd = (balances.referralUsdc ?? 0) + (balances.referralClt ?? 0) * cltPrice;
  const [withdrawToken, setWithdrawToken] = useState<"usdc" | "clawdtrust" | null>(null);

  function startEdit() {
    setUsername(profile?.username ?? "");
    setDisplayName(profile?.display_name ?? "");
    setTwitterHandle(profile?.twitter_handle ?? "");
    setEditing(true);
  }

  async function saveProfile() {
    setSaving(true);
    const res = await updateWalletProfile(walletAddress, {
      username: username.trim() || undefined,
      display_name: displayName.trim() || undefined,
      twitter_handle: twitterHandle.trim() || undefined,
    });
    setSaving(false);
    if (res.error) { toast.error(tr(res.error)); return; }
    toast.success(tr("Profile updated"));
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["wallet-profile", walletAddress] });
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const res = await uploadAvatar(file, walletAddress);
    setUploading(false);
    if ("error" in res) { toast.error(tr(res.error)); return; }
    toast.success(tr("Avatar updated"));
    qc.invalidateQueries({ queryKey: ["wallet-profile", walletAddress] });
  }

  async function copyAddress() {
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const avatarSrc = profile?.avatar_src;
  const displayLabel = profile?.display_name || profile?.username || shortAddr(walletAddress);

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-[88vw] max-w-sm flex flex-col gap-0 p-0 h-[100dvh]">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="text-base font-bold">{tr("My wallet")}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* Identity */}
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              {avatarSrc ? (
                <Image src={avatarSrc} alt={tr("avatar")} width={44} height={44}
                  className="rounded-full object-cover" unoptimized />
              ) : (
                <div className="flex size-11 items-center justify-center rounded-full bg-primary/12">
                  <User className="size-5 text-primary" />
                </div>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border border-border bg-card shadow-sm hover:bg-muted disabled:opacity-50"
                title={tr("Upload avatar")}
              >
                <Camera className="size-2.5 text-muted-foreground" />
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={handleAvatarChange} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="font-semibold text-foreground truncate">{displayLabel}</p>
                <OctoBadge totalOcto={octoBalance} size={14} />
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="font-mono text-xs text-muted-foreground">{shortAddr(walletAddress)}</p>
                <button
                  type="button"
                  onClick={copyAddress}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title={tr("Copy address")}
                >
                  {copied
                    ? <Check className="size-3 text-up" />
                    : <Copy className="size-3" />}
                </button>
              </div>
            </div>

            <button type="button" onClick={startEdit}
              className="shrink-0 rounded-xl p-1.5 text-muted-foreground hover:bg-muted"
              title={tr("Edit profile")}>
              <Pencil className="size-4" />
            </button>
          </div>

          {/* Solde total + variation sur 24 h */}
          {!editing && (
            <div>
              <p className="text-[44px] font-extrabold leading-none tracking-tight text-foreground">{fmtUsd(totalUsd)}</p>
              <div className="mt-2 flex items-center gap-2 text-[15px] font-bold">
                <span className={change >= 0 ? "text-up" : "text-down"}>{change >= 0 ? "+" : "-"}{fmtUsd(Math.abs(change))}</span>
                <span className={`rounded-lg px-1.5 py-0.5 text-[13px] text-white ${change >= 0 ? "bg-up" : "bg-down"}`}>{change >= 0 ? "+" : "-"}{changePct.toFixed(2)}%</span>
                <span className="text-xs font-medium text-muted-foreground">{tr("24h")}</span>
              </div>
            </div>
          )}

          {/* Actions — boutons en verre */}
          {!editing && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: T("Withdraw"), icon: ArrowUpRight, onClick: () => setWithdrawToken(balances.usdc > 0 || balances.clt <= 0 ? "usdc" : "clawdtrust") },
                { label: copiedRef ? T("Copied!") : T("Invite"), icon: copiedRef ? Check : UserPlus, onClick: () => void copyReferralLink(), disabled: !referralLink },
                { label: T("History"), icon: History, href: isAdmin ? "/admin/account" : "/dashboard" },
              ].map((b) => {
                const inner = (
                  <>
                    <span className="flex size-10 items-center justify-center rounded-full border border-foreground/10 bg-background/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] dark:border-white/15 dark:bg-white/10">
                      <b.icon className="size-[18px] text-foreground" strokeWidth={2} />
                    </span>
                    <span className="text-[13px] font-semibold text-foreground">{tr(b.label)}</span>
                  </>
                );
                const cls = "flex flex-col items-center gap-1.5 rounded-[20px] border border-foreground/10 bg-foreground/[0.04] py-3 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition-colors hover:bg-foreground/[0.08] disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.06] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]";
                return b.href
                  ? <Link key={b.label} href={b.href} onClick={onClose} className={cls}>{inner}</Link>
                  : <button key={b.label} type="button" onClick={b.onClick} disabled={b.disabled} className={cls}>{inner}</button>;
              })}
            </div>
          )}

          {/* Soldes */}
          {!editing && (
            <div>
              <p className="mb-2 flex items-center gap-1 text-lg font-extrabold text-foreground">{tr("Balances")}</p>
              <div className="space-y-2">
                <BalanceRow logo={<TokenLogo token="usdc" className="size-11" />} name="USDC" sub={`${balances.usdc.toFixed(2)} USDC`} value={fmtUsd(balances.usdc)} note={tr("Available")} />
                <BalanceRow logo={<TokenLogo token="clawdtrust" className="size-11" />} name="ClawdTrust" sub={`${fmtClt(balances.clt)} CLT`}
                  value={cltPrice > 0 ? fmtUsd(cltUsd) : fmtClt(balances.clt)} note={tr("Available")} />
                <BalanceRow logo={<Image src="/octo-coin.png" alt="OMERO" width={44} height={44} className="size-11 rounded-full object-cover" unoptimized />}
                  name="OMERO" sub={`${octoBalance.toLocaleString()} ${tr("points")}`}
                  value={currentTier ? currentTier.label : "—"}
                  note={isMaxTier ? tr("Max tier reached") : nextTierObj ? `${nextTierObj.label} · ${nextTierObj.min.toLocaleString()}` : tr("No tier yet")} />
              </div>
            </div>
          )}

          {/* Gains */}
          {!editing && (
            <div>
              <p className="mb-2 text-lg font-extrabold text-foreground">{tr("Earnings")}</p>
              <div className="space-y-2">
                <BalanceRow logo={<RowIcon icon={Trophy} />} name={tr("Winnings")} sub={`${tr("{n} won", { n: drawerStats?.win_count ?? 0 })} · ${drawerStats?.win_rate ?? 0}%`}
                  value={fmtUsd(winningsUsd)} />
                <BalanceRow logo={<RowIcon icon={UserPlus} />} name={tr("Referral")} sub={tr("{n} friends", { n: drawerStats?.referral_count ?? 0 })}
                  value={fmtUsd(referralUsd)} note={`${(drawerStats?.referral_octo ?? 0).toLocaleString()} OMERO`} href={isAdmin ? "/admin/account" : "/dashboard/referrals"} onNavigate={onClose} />
                <BalanceRow logo={<RowIcon icon={Rocket} />} name={tr("Creator fees")} sub={tr("{n} launched", { n: drawerStats?.tokens_launched ?? 0 })}
                  value={tr("Claim")} href="/dashboard/launchpad" onNavigate={onClose} />
              </div>
            </div>
          )}

          {/* Liens */}
          {!editing && (
        <div className="space-y-2 pt-1">
          <Link
            href="/dashboard/pools"
            onClick={onClose}
            className="flex w-full items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
          >
            <Plus className="size-4" />
            <span>{tr("Create a market")}</span>
          </Link>

          <Link
            href={`/profile/${walletAddress}`}
            onClick={onClose}
            className="flex w-full items-center gap-3 rounded-2xl border border-border px-4 py-3 text-sm font-medium transition-colors hover:bg-muted"
          >
            <User className="size-4 text-muted-foreground" />
            <span>{tr("My profile")}</span>
          </Link>

          {!isAdmin && (
            <Link
              href="/dashboard"
              onClick={onClose}
              className="flex w-full items-center gap-3 rounded-2xl border border-border px-4 py-3 text-sm font-medium transition-colors hover:bg-muted"
            >
              <LayoutDashboard className="size-4 text-muted-foreground" />
              <span>{tr("Dashboard")}</span>
            </Link>
          )}

          {isAdmin && (
            <Link
              href="/admin"
              onClick={onClose}
              className="flex w-full items-center gap-3 rounded-2xl border border-border px-4 py-3 text-sm font-medium transition-colors hover:bg-muted"
            >
              <Settings2 className="size-4 text-muted-foreground" />
              <span>{tr("Admin Panel")}</span>
            </Link>
          )}

        </div>
          )}

          {/* Edit form */}
          {editing && (
            <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
              <p className="text-[13px] font-semibold text-muted-foreground">
                {tr("Edit profile")}
              </p>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">{tr("Username")}</label>
                <input
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="@username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">{tr("Display name")}</label>
                <input
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder={tr("Display name")}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">{tr("Twitter / X handle")}</label>
                <input
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="@yourhandle"
                  value={twitterHandle}
                  onChange={(e) => setTwitterHandle(e.target.value)}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setEditing(false)}
                  className="flex-1 rounded-xl border border-border py-2 text-sm font-semibold text-muted-foreground hover:bg-muted">
                  {tr("Cancel")}
                </button>
                <button type="button" onClick={saveProfile} disabled={saving}
                  className="flex-1 rounded-[14px] bg-foreground py-2 text-sm font-bold text-background hover:opacity-90 disabled:opacity-60 btn-primary">
                  {saving ? tr("Saving…") : tr("Save")}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Fixed bottom bar — always visible, never scrolled away ── */}
        <div className="shrink-0 border-t border-border px-5 pt-4 pb-4" style={{ paddingBottom: isPhantom ? '90px' : 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
          <div className="flex items-center gap-2">
            {/* Settings dropdown */}
            <div className="relative" ref={settingsRef}>
              <button
                type="button"
                onClick={() => setShowSettings((s) => !s)}
                className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted transition-colors"
                title={tr("Settings")}
              >
                <Settings2 className="size-4" />
              </button>

              {showSettings && (
                <div className="absolute bottom-full mb-2 left-0 z-50 w-44 rounded-xl border border-border bg-card shadow-md overflow-hidden">
                  <button
                    type="button"
                    onClick={() => { setTheme(isDark ? "light" : "dark"); setShowSettings(false); }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    {isDark
                      ? <Moon className="size-4 text-muted-foreground" />
                      : <Sun className="size-4 text-muted-foreground" />}
                    <span>{isDark ? tr("Dark mode") : tr("Light mode")}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Disconnect */}
            <button
              type="button"
              onClick={onDisconnect}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/5 transition-colors"
            >
              <LogOut className="size-4" />
              {tr("Disconnect")}
            </button>
          </div>
        </div>
        {withdrawToken && (
          <WithdrawModal token={withdrawToken} balance={withdrawToken === "usdc" ? balances.usdc : balances.clt}
            onClose={() => { setWithdrawToken(null); qc.invalidateQueries({ queryKey: ["platform-balances", walletAddress] }); }} />
        )}
      </SheetContent>
    </Sheet>
  );
}

// Main button (inner — needs useSearchParams)

function WalletButtonInner() {
  const { tr } = useT();
  const { walletAddress, walletType, isAuthenticated, isLoading, setWalletType } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showDialog, setShowDialog] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    const handler = () => setShowDialog(true);
    const openProfile = () => setShowProfile(true);
    window.addEventListener("open-wallet-connect", handler);
    window.addEventListener("open-wallet-profile", openProfile);
    return () => {
      window.removeEventListener("open-wallet-connect", handler);
      window.removeEventListener("open-wallet-profile", openProfile);
    };
  }, []);

  async function handleSelectWallet(type: WalletType) {
    setShowDialog(false);
    setIsConnecting(true);
    try {
      const result = await connectWalletAndAuth(type);
      if (result.success) {
        setWalletType(type);
        toast.success(tr("Wallet connected"));
        // Redirect to the page the user was trying to access
        const returnTo = searchParams.get("returnTo");
        if (returnTo && returnTo.startsWith("/")) {
          router.push(returnTo);
        }
      } else {
        toast.error(tr(result.error ?? "Connection failed"));
      }
    } finally {
      setIsConnecting(false);
    }
  }

  async function handleDisconnect() {
    await disconnectWallet(walletType);
    setWalletType(null);
    setShowProfile(false);
    toast.success(tr("Disconnected"));
    router.push("/");
  }

  if (isLoading) return null;

  if (isAuthenticated && walletAddress) {
    const walletIcon = walletType ? WALLET_ICONS[walletType] : null;
    return (
      <>
        <button
          type="button"
          onClick={() => setShowProfile(true)}
          className="hidden items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          {walletIcon ? (
            <Image src={walletIcon} alt={walletType ?? tr("wallet")} width={16} height={16}
              className="size-4 rounded-full object-contain" unoptimized />
          ) : (
            <span className="size-2 rounded-full bg-emerald-500" />
          )}
          {shortAddr(walletAddress)}
        </button>
        {showProfile && (
          <ProfileDrawer
            walletAddress={walletAddress}
            open={showProfile}
            onClose={() => setShowProfile(false)}
            onDisconnect={handleDisconnect}
          />
        )}
      </>
    );
  }

  const availableWallets = getAvailableWallets();

  return (
    <>
      <button
        type="button"
        onClick={() => setShowDialog(true)}
        disabled={isConnecting}
        className="hidden rounded-[14px] bg-foreground px-4 py-2 text-sm font-bold text-background transition-colors hover:opacity-90 disabled:opacity-60 btn-primary"
      >
        {isConnecting ? tr("Connecting...") : tr("Connect Wallet")}
      </button>
      {showDialog && typeof document !== "undefined" && createPortal(
        <WalletSelectDialog
          wallets={availableWallets}
          onSelect={handleSelectWallet}
          onClose={() => setShowDialog(false)}
        />,
        document.body,
      )}
    </>
  );
}

export function WalletButton() {
  return (
    <Suspense fallback={null}>
      <WalletButtonInner />
    </Suspense>
  );
}
