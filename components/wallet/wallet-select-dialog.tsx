"use client";

import { toast } from "sonner";
import { useT, Rich } from "@/lib/i18n";
import { startDeeplinkConnect } from "@/lib/wallet/phantom-deeplink";
import { X_LOGIN_ENABLED, XLogo, GithubLogo, TwitchLogo } from "@/components/auth/x-login";
import type { SocialMethod } from "@/components/auth/x-login-flow";
import { type WalletInfo, type WalletType, WALLET_COLORS } from "@/lib/wallet/adapters";

type Props = {
  wallets: WalletInfo[];
  onSelect: (type: WalletType) => void;
  onClose: () => void;
  onX?: (method?: SocialMethod) => void;
};

function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}


export function WalletSelectDialog({ wallets, onSelect, onClose, onX }: Props) {
  const { tr } = useT();
  const installed = wallets.filter((w) => w.detected);
  const notInstalled = wallets.filter((w) => !w.detected);
  const mobile = isMobile();

  function handleSelect(wallet: WalletInfo) {
    if (wallet.detected) {
      onSelect(wallet.type);
      return;
    }
    if (mobile) {
      // Sur tout mobile (TWA ou navigateur classique), on passe par /mobile-connect.
      // Le wallet ouvre cette page dans son navigateur intégré (wallet injecté),
      // connecte + signe, puis redirige vers omdot.fun/#twa_session=<tokens>.
      // Android route ensuite ce lien : vers la TWA si installée (Digital Asset Links),
      // sinon vers Chrome — dans les deux cas auth-provider.tsx restaure la session.
      const inApp = /OMdotApp/.test(navigator.userAgent);
      // Navigateur mobile classique (Chrome, Safari) : Phantom par liens profonds, sans ouvrir le site dans Phantom.
      if ((wallet.type === "phantom" || wallet.type === "solflare") && !inApp) {
        startDeeplinkConnect(
          wallet.type,
          sessionStorage.getItem("referral_code") ?? new URLSearchParams(window.location.search).get("ref") ?? undefined,
        );
        return;
      }
      const origin = window.location.origin;
      const ref = new URLSearchParams(window.location.search).get("ref");
      const connectUrl =
        `${origin}/mobile-connect?wallet=${wallet.type}` +
        (ref ? `&ref=${encodeURIComponent(ref)}` : "") +
        (/OMdotApp/.test(navigator.userAgent) ? "&app=1" : "");
      if (!wallet.mobileDeepLink) {
        // Pas de lien officiel (Robinhood Wallet) : on explique comment ouvrir le site dans l'app.
        toast.message(tr("Open the {name} app, go to its Web3 browser and visit omdot.fun", { name: wallet.name }), { duration: 8000 });
        return;
      }
      window.location.href = wallet.mobileDeepLink(connectUrl);
      return;
    }
    // Bureau : ouvrir la page de téléchargement dans un nouvel onglet
    window.open(wallet.downloadUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-5 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">{tr("Connect your wallet")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label={tr("Close")}
          >
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Connexion avec X : un wallet est cree pour la personne */}
        {X_LOGIN_ENABLED && onX && (
          <>
            <button type="button" onClick={() => onX("twitter")}
              className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3 text-sm font-bold text-background transition-opacity hover:opacity-90">
              <XLogo className="size-4" />{tr("Continue with X")}
            </button>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {([["github", "GitHub", GithubLogo], ["twitch", "Twitch", TwitchLogo]] as const).map(([m, label, Logo]) => (
                <button key={m} type="button" onClick={() => onX(m)} aria-label={tr("Continue with {name}", { name: label })}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-2 py-2.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted">
                  <Logo className="size-4 shrink-0" />{label}
                </button>
              ))}
            </div>
            <p className="mb-3 text-center text-[12px] text-muted-foreground">{tr("No wallet? One is created for you.")}</p>
            <div className="mb-3 flex items-center gap-3 text-[12px] text-muted-foreground"><span className="h-px flex-1 bg-border" />{tr("or")}<span className="h-px flex-1 bg-border" /></div>
          </>
        )}

        {/* Installed wallets */}
        {installed.length > 0 && (
          <div className="mb-4 space-y-2">
            {installed.map((w) => (
              <WalletItem key={w.type} wallet={w} onClick={() => handleSelect(w)} />
            ))}
          </div>
        )}

        {/* Not installed wallets */}
        {notInstalled.length > 0 && (
          <>
            {installed.length > 0 && (
              <p className="mb-2 text-[13px] font-medium text-muted-foreground">
                {mobile ? tr("Open in app") : tr("Not installed")}
              </p>
            )}
            <div className="space-y-2">
              {notInstalled.map((w) => (
                <WalletItem key={w.type} wallet={w} onClick={() => handleSelect(w)} mobile={mobile} />
              ))}
            </div>
          </>
        )}

        <p className="mt-4 text-center text-xs text-muted-foreground">
          <Rich linkClass="text-primary hover:underline">{tr("New to Solana? [Get started with Phantom](https://phantom.app)")}</Rich>
        </p>
      </div>
    </div>
  );
}

function WalletItem({
  wallet,
  onClick,
  mobile,
}: {
  wallet: WalletInfo;
  onClick: () => void;
  mobile?: boolean;
}) {
  const { tr } = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-secondary/40 px-4 py-3 text-left transition-colors hover:bg-secondary"
    >
      {/* Logo with initial fallback */}
      <div className={`relative size-9 shrink-0 rounded-xl overflow-hidden flex items-center justify-center ${WALLET_COLORS[wallet.type] ?? "bg-muted"}`}>
        <span className="text-white text-sm font-bold select-none">{wallet.name[0]}</span>
        <img
          src={wallet.icon}
          alt={wallet.name}
          className="absolute inset-0 size-9 rounded-xl object-contain"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      </div>

      <div className="flex-1">
        <p className="text-sm font-semibold text-foreground">{wallet.name}</p>
        <p className="text-xs text-muted-foreground">
          {wallet.detected
            ? tr("Detected")
            : mobile
            ? tr("Tap to open app")
            : tr("Click to install")}
        </p>
      </div>

      {wallet.detected && (
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
          {tr("Ready")}
        </span>
      )}
      {!wallet.detected && mobile && (
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
          {tr("Open")}
        </span>
      )}
    </button>
  );
}
