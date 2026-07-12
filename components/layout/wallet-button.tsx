"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { Camera, Check, Copy, LayoutDashboard, LogOut, Moon, Pencil, Settings2, Sun, User } from "lucide-react";
import Image from "next/image";
import { useAuth } from "@/providers/auth-provider";
import { connectWalletAndAuth, disconnectWallet } from "@/lib/wallet/auth";
import { getAvailableWallets, type WalletType } from "@/lib/wallet/adapters";
import { WalletSelectDialog } from "@/components/wallet/wallet-select-dialog";
import {
  getWalletProfile,
  updateWalletProfile,
  uploadAvatar,
  getPlatformBalances,
} from "@/services/wallet-service";
import { OctoBadge } from "@/components/leaderboard/octo-tier-badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// i18n

type Lang = "en" | "fr";

const T = {
  en: {
    myWallet: "My wallet",
    editProfile: "Edit profile",
    username: "Username",
    displayName: "Display name",
    twitterHandle: "Twitter / X handle",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving…",
    overview: "Overview",
    octoBalance: "OCTO balance",
    twitter: "Twitter / X",
    adminPanel: "Admin Panel",
    disconnect: "Disconnect",
    profileUpdated: "Profile updated",
    avatarUpdated: "Avatar updated",
  },
  fr: {
    myWallet: "Mon portefeuille",
    editProfile: "Modifier le profil",
    username: "Nom d'utilisateur",
    displayName: "Nom affiché",
    twitterHandle: "Pseudo Twitter / X",
    cancel: "Annuler",
    save: "Enregistrer",
    saving: "Enregistrement…",
    overview: "Aperçu",
    octoBalance: "Solde OCTO",
    twitter: "Twitter / X",
    adminPanel: "Panneau admin",
    disconnect: "Déconnecter",
    profileUpdated: "Profil mis à jour",
    avatarUpdated: "Avatar mis à jour",
  },
} as const;

function useLang(): [Lang, () => void] {
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window === "undefined") return "en";
    return (localStorage.getItem("octo-lang") as Lang) ?? "en";
  });
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  function toggle() {
    setLang((l) => {
      const next: Lang = l === "en" ? "fr" : "en";
      localStorage.setItem("octo-lang", next);
      document.documentElement.lang = next;
      return next;
    });
  }
  return [lang, toggle];
}

function shortAddr(addr: string) {
  return addr.slice(0, 4) + "..." + addr.slice(-4);
}

// Profile drawer

function ProfileDrawer({
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
  const [lang, toggleLang] = useLang();
  const t = T[lang];
  const { theme, setTheme } = useTheme();
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

  const { data: octoBalance = 0 } = useQuery({
    queryKey: ["platform-balances", walletAddress],
    queryFn: () => getPlatformBalances(walletAddress),
    staleTime: 60_000,
    select: (d) => d.octo,
  });

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
    if (res.error) { toast.error(res.error); return; }
    toast.success(t.profileUpdated);
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["wallet-profile", walletAddress] });
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const res = await uploadAvatar(file, walletAddress);
    setUploading(false);
    if ("error" in res) { toast.error(res.error); return; }
    toast.success(t.avatarUpdated);
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
      <SheetContent side="right" className="w-80 sm:w-96 flex flex-col gap-0 p-0">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="text-base font-bold">{t.myWallet}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* Identity */}
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              {avatarSrc ? (
                <Image src={avatarSrc} alt="avatar" width={44} height={44}
                  className="rounded-full object-cover" unoptimized />
              ) : (
                <div className="flex size-11 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
                  <User className="size-5 text-orange-500" />
                </div>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border border-border bg-card shadow-sm hover:bg-muted disabled:opacity-50"
                title="Upload avatar"
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
                  title="Copy address"
                >
                  {copied
                    ? <Check className="size-3 text-emerald-500" />
                    : <Copy className="size-3" />}
                </button>
              </div>
            </div>

            <button type="button" onClick={startEdit}
              className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
              title="Edit profile">
              <Pencil className="size-4" />
            </button>
          </div>

          {/* Overview */}
          {!editing && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.overview}</p>
              <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t.octoBalance}</span>
                <span className="text-sm font-semibold">{octoBalance.toLocaleString()} OCTO</span>
              </div>
              {profile?.twitter_handle && (
                <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t.twitter}</span>
                  <span className="text-sm font-medium">@{profile.twitter_handle.replace(/^@/, "")}</span>
                </div>
              )}
            </div>
          )}

          {/* Edit form */}
          {editing && (
            <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t.editProfile}
              </p>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">{t.username}</label>
                <input
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  placeholder="@username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">{t.displayName}</label>
                <input
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  placeholder="Display name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">{t.twitterHandle}</label>
                <input
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  placeholder="@yourhandle"
                  value={twitterHandle}
                  onChange={(e) => setTwitterHandle(e.target.value)}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setEditing(false)}
                  className="flex-1 rounded-xl border border-border py-2 text-sm font-semibold text-muted-foreground hover:bg-muted">
                  {t.cancel}
                </button>
                <button type="button" onClick={saveProfile} disabled={saving}
                  className="flex-1 rounded-xl bg-orange-500 py-2 text-sm font-semibold text-white hover:bg-orange-400 disabled:opacity-60">
                  {saving ? t.saving : t.save}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-4 space-y-2">
          {!isAdmin && (
            <Link
              href="/dashboard"
              onClick={onClose}
              className="flex w-full items-center gap-3 rounded-2xl border border-border px-4 py-3 text-sm font-medium transition-colors hover:bg-muted"
            >
              <LayoutDashboard className="size-4 text-muted-foreground" />
              <span>Dashboard</span>
            </Link>
          )}

          {isAdmin && (
            <Link
              href="/admin"
              onClick={onClose}
              className="flex w-full items-center gap-3 rounded-2xl border border-border px-4 py-3 text-sm font-medium transition-colors hover:bg-muted"
            >
              <Settings2 className="size-4 text-muted-foreground" />
              <span>{t.adminPanel}</span>
            </Link>
          )}

          <div className="flex items-center gap-2">
            {/* Settings dropdown */}
            <div className="relative" ref={settingsRef}>
              <button
                type="button"
                onClick={() => setShowSettings((s) => !s)}
                className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted transition-colors"
                title="Settings"
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
                    <span>{isDark ? "Dark mode" : "Light mode"}</span>
                  </button>
                  <div className="h-px bg-border" />
                  <button
                    type="button"
                    onClick={() => { toggleLang(); setShowSettings(false); }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <span className="flex size-4 items-center justify-center text-xs font-bold text-muted-foreground">
                      {lang === "en" ? "FR" : "EN"}
                    </span>
                    <span>{lang === "en" ? "Français" : "English"}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Disconnect */}
            <button
              type="button"
              onClick={onDisconnect}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/5 transition-colors"
            >
              <LogOut className="size-4" />
              {t.disconnect}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Main button (inner — needs useSearchParams)

function WalletButtonInner() {
  const { walletAddress, walletType, isAuthenticated, isLoading, setWalletType } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showDialog, setShowDialog] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  async function handleSelectWallet(type: WalletType) {
    setShowDialog(false);
    setIsConnecting(true);
    try {
      const result = await connectWalletAndAuth(type);
      if (result.success) {
        setWalletType(type);
        toast.success("Wallet connected");
        // Redirect to the page the user was trying to access
        const returnTo = searchParams.get("returnTo");
        if (returnTo && returnTo.startsWith("/")) {
          router.push(returnTo);
        }
      } else {
        toast.error(result.error ?? "Connection failed");
      }
    } finally {
      setIsConnecting(false);
    }
  }

  async function handleDisconnect() {
    await disconnectWallet(walletType);
    setWalletType(null);
    setShowProfile(false);
    toast.success("Disconnected");
    router.push("/");
  }

  if (isLoading) return <div className="h-9 w-36 animate-pulse rounded-md bg-muted" />;

  if (isAuthenticated && walletAddress) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowProfile(true)}
          className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <span className="size-2 rounded-full bg-emerald-500" />
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
        className="rounded-md bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-400 disabled:opacity-60"
      >
        {isConnecting ? "Connecting..." : "Connect Wallet"}
      </button>
      {showDialog && (
        <WalletSelectDialog
          wallets={availableWallets}
          onSelect={handleSelectWallet}
          onClose={() => setShowDialog(false)}
        />
      )}
    </>
  );
}

export function WalletButton() {
  return (
    <Suspense fallback={<div className="h-9 w-36 animate-pulse rounded-md bg-muted" />}>
      <WalletButtonInner />
    </Suspense>
  );
}
